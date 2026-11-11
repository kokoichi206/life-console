#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["boto3==1.42.65"]
# ///
"""D1 の健康記録と R2 の食事写真を読み取る。"""

import argparse
import json
import os
import shutil
import sys
import tempfile
from datetime import UTC, date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import boto3
from botocore.exceptions import BotoCoreError, ClientError

JST = timezone(timedelta(hours=9))
D1_API = "https://api.cloudflare.com/client/v4"
PERIOD = "deleted_at IS NULL AND julianday(occurred_at) >= julianday(?) AND julianday(occurred_at) < julianday(?)"
WEIGHTS_SQL = f"""
SELECT id, source, weight_grams / 1000.0 AS weightKg,
       body_fat_percent AS bodyFatPercent, occurred_at AS occurredAt,
       recorded_at AS recordedAt
FROM weights WHERE {PERIOD}
ORDER BY julianday(occurred_at), id
"""
MEALS_SQL = f"""
WITH selected_meals AS (SELECT * FROM meals WHERE {PERIOD})
SELECT m.id, m.memo, m.occurred_at AS occurredAt,
       m.manual_calories_kcal AS manualCaloriesKcal, m.tags_json AS tags,
       m.recorded_at AS recordedAt,
       m.photo_id AS photoId, m.additional_photo_ids AS additionalPhotoIds,
       n.id AS estimateId, n.model, n.analyzed_at AS analyzedAt,
       n.calories_kcal AS estimatedCaloriesKcal, n.protein_grams AS proteinGrams,
       n.fat_grams AS fatGrams, n.carbohydrate_grams AS carbohydrateGrams
FROM selected_meals AS m
LEFT JOIN nutrition_estimates AS n ON n.id = (
    SELECT e.id FROM nutrition_estimates AS e WHERE e.meal_id = m.id
    ORDER BY e.analyzed_at DESC, e.rowid DESC LIMIT 1
)
ORDER BY julianday(m.occurred_at), m.id
"""
PHOTOS_SQL = f"""
WITH selected_meals AS (
    SELECT id, photo_id, additional_photo_ids FROM meals WHERE {PERIOD}
), photo_ids AS (
    SELECT id AS mealId, photo_id AS photoId, 0 AS position
    FROM selected_meals WHERE photo_id IS NOT NULL
    UNION ALL
    SELECT m.id, p.value, CAST(p.key AS INTEGER) + 1
    FROM selected_meals AS m, json_each(m.additional_photo_ids) AS p
)
SELECT ids.mealId, ids.photoId, ids.position,
       p.object_key AS objectKey, p.content_type AS contentType
FROM photo_ids AS ids JOIN meal_photos AS p ON p.id = ids.photoId
ORDER BY ids.mealId, ids.position
"""


class HealthReadError(Exception):
    """個人データや資格情報を含まない利用者向けの失敗。"""


def required_environment(name):
    value = os.environ.get(name)
    if not value:
        raise HealthReadError(f"環境変数 {name} を設定してください。")
    return value


class D1Reader:
    def __init__(self, account_id, database_id, token):
        self.endpoint = (
            f"{D1_API}/accounts/{account_id}/d1/database/{database_id}/query"
        )
        self.token = token

    def query(self, sql, params):
        request = Request(
            self.endpoint,
            data=json.dumps({"sql": sql, "params": params}).encode(),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
        if not isinstance(payload, dict) or payload.get("success") is not True:
            raise HealthReadError(
                "D1 の読み取りに失敗しました。接続設定と読み取り権限を確認してください。"
            )
        result = payload.get("result")
        if (
            not isinstance(result, list)
            or len(result) != 1
            or not isinstance(result[0], dict)
            or result[0].get("success") is not True
        ):
            raise HealthReadError(
                "D1 のクエリに失敗しました。接続先の schema を確認してください。"
            )
        rows = result[0].get("results")
        if not isinstance(rows, list):
            raise HealthReadError("D1 の応答にクエリ結果がありません。")
        return rows


def read_records(reader, from_date, to_date):
    starts_at = datetime.combine(from_date, time(), JST).isoformat()
    ends_at = datetime.combine(to_date + timedelta(days=1), time(), JST).isoformat()
    params = [starts_at, ends_at]
    meals = []
    for row in reader.query(MEALS_SQL, params):
        estimate = (
            None
            if row["estimateId"] is None
            else {
                "model": row["model"],
                "analyzedAt": row["analyzedAt"],
                "caloriesKcal": row["estimatedCaloriesKcal"],
                "proteinGrams": row["proteinGrams"],
                "fatGrams": row["fatGrams"],
                "carbohydrateGrams": row["carbohydrateGrams"],
            }
        )
        manual = row["manualCaloriesKcal"]
        calories = (
            manual
            if manual is not None
            else (None if estimate is None else estimate["caloriesKcal"])
        )
        meals.append(
            {
                "id": row["id"],
                "memo": row["memo"],
                "occurredAt": row["occurredAt"],
                "recordedAt": row["recordedAt"],
                "tags": json.loads(row["tags"]),
                "photoIds": ([] if row["photoId"] is None else [row["photoId"]])
                + json.loads(row["additionalPhotoIds"]),
                "manualCaloriesKcal": manual,
                "estimate": estimate,
                "caloriesKcal": calories,
                "caloriesSource": "manual"
                if manual is not None
                else ("estimate" if estimate is not None else None),
            }
        )
    return {
        "period": {
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "timezone": "Asia/Tokyo",
        },
        "fetchedAt": datetime.now(UTC).isoformat(),
        "weights": reader.query(WEIGHTS_SQL, params),
        "meals": meals,
        "photos": [
            {**photo, "localPath": None} for photo in reader.query(PHOTOS_SQL, params)
        ],
    }


def download_photos(records, client, bucket, destination):
    extensions = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    destination.mkdir(mode=0o700)
    for index, photo in enumerate(records["photos"], start=1):
        filename = destination / f"{index:04d}.{extensions[photo['contentType']]}"
        response = client.get_object(Bucket=bucket, Key=photo["objectKey"])
        with response["Body"] as body, filename.open("xb") as output:
            shutil.copyfileobj(body, output)
        photo["localPath"] = str(filename.resolve())


def run(args):
    if args.from_date > args.to_date:
        raise HealthReadError("--from は --to 以前の日付を指定してください。")
    account_id = required_environment("LIFE_CONSOLE_ACCOUNT_ID")
    reader = D1Reader(
        account_id,
        required_environment("LIFE_CONSOLE_D1_DATABASE_ID"),
        required_environment("LIFE_CONSOLE_D1_READ_TOKEN"),
    )
    photo_client = None
    bucket = None
    if args.photos:
        bucket = required_environment("LIFE_CONSOLE_R2_BUCKET")
        photo_client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id=required_environment(
                "LIFE_CONSOLE_R2_READ_ACCESS_KEY_ID"
            ),
            aws_secret_access_key=required_environment(
                "LIFE_CONSOLE_R2_READ_SECRET_ACCESS_KEY"
            ),
        )
    records = read_records(reader, args.from_date, args.to_date)
    output_root = Path(args.output_dir).expanduser()
    output_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination = Path(tempfile.mkdtemp(prefix="read-", dir=output_root))
    if args.photos:
        download_photos(records, photo_client, bucket, destination / "photos")
    report = destination / "records.json"
    report.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {
        "report": str(report.resolve()),
        "weights": len(records["weights"]),
        "meals": len(records["meals"]),
        "photos": len(records["photos"]),
        "photosDownloaded": args.photos,
    }


def parse_date(value):
    try:
        parsed = date.fromisoformat(value)
        if parsed.isoformat() != value:
            raise ValueError
        return parsed
    except ValueError:
        raise argparse.ArgumentTypeError(
            "日付は YYYY-MM-DD で指定してください。"
        ) from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="from_date", required=True, type=parse_date)
    parser.add_argument("--to", dest="to_date", required=True, type=parse_date)
    parser.add_argument(
        "--photos", action="store_true", help="R2 の食事画像もダウンロードする"
    )
    parser.add_argument(
        "--output-dir",
        default=str(Path.home() / ".cache/life-console-read"),
        help="実行ごとの保存先を作る親ディレクトリ",
    )
    args = parser.parse_args(argv)
    try:
        summary = run(args)
    except HealthReadError as error:
        print(str(error), file=sys.stderr)
        return 1
    except HTTPError as error:
        print(
            f"D1 の HTTP リクエストが失敗しました（status={error.code}）。",
            file=sys.stderr,
        )
        return 1
    except URLError:
        print(
            "D1 に接続できません。ネットワークと接続設定を確認してください。",
            file=sys.stderr,
        )
        return 1
    except ClientError as error:
        print(
            f"R2 の読み取りが失敗しました（code={error.response['Error']['Code']}）。",
            file=sys.stderr,
        )
        return 1
    except BotoCoreError:
        print("R2 の接続または画像の読み取りに失敗しました。", file=sys.stderr)
        return 1
    except OSError:
        print("読み取り結果の保存または接続に失敗しました。", file=sys.stderr)
        return 1
    except json.JSONDecodeError:
        print("保存データまたは外部 API の JSON を読み取れません。", file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
