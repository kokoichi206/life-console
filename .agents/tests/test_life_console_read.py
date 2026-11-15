# /// script
# requires-python = ">=3.11"
# dependencies = ["boto3==1.42.65"]
# ///
import argparse
import base64
import importlib.util
import io
import json
import sqlite3
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import boto3
from botocore.response import StreamingBody
from botocore.stub import Stubber

SKILL = Path(__file__).resolve().parents[1] / "skills/life-console-read"
spec = importlib.util.spec_from_file_location(
    "read_health", SKILL / "scripts/read_health.py"
)
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


def fixture():
    connection = sqlite3.connect(":memory:", check_same_thread=False)
    connection.row_factory = sqlite3.Row
    migrations = Path(__file__).resolve().parents[2] / "packages/db/migrations"
    for migration in sorted(migrations.glob("*.sql")):
        connection.executescript(migration.read_text())
    connection.executemany(
        "INSERT INTO weights (id,source,weight_grams,body_fat_percent,occurred_at,recorded_at,deleted_at,source_key) VALUES (?,?,?,?,?,?,?,?)",
        [
            row + (row[0],)
            for row in [
                (
                    "before",
                    "manual",
                    64000,
                    None,
                    "2026-11-09T14:59:59Z",
                    "2026-11-09",
                    None,
                ),
                (
                    "start",
                    "manual",
                    65000,
                    14.5,
                    "2026-11-09T15:00:00Z",
                    "2026-11-10",
                    None,
                ),
                (
                    "last",
                    "manual",
                    65200,
                    None,
                    "2026-11-10T14:59:59Z",
                    "2026-11-10",
                    None,
                ),
                (
                    "after",
                    "manual",
                    66000,
                    None,
                    "2026-11-10T15:00:00Z",
                    "2026-11-11",
                    None,
                ),
                (
                    "deleted",
                    "manual",
                    67000,
                    None,
                    "2026-11-10T01:00:00Z",
                    "2026-11-10",
                    "2026-11-10",
                ),
            ]
        ],
    )
    connection.executemany(
        "INSERT INTO meals (id,memo,occurred_at,recorded_at,manual_calories_kcal,photo_id,additional_photo_ids,tags_json,deleted_at,client_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
            row + (row[0],)
            for row in [
                (
                    "m1",
                    "架空の食事",
                    "2026-11-10T03:00:00Z",
                    "2026-11-10T03:01:00Z",
                    0,
                    "p1",
                    '["p2","p3"]',
                    '["昼食"]',
                    None,
                ),
                (
                    "m2",
                    "架空の未解析食事",
                    "2026-11-10T04:00:00Z",
                    "2026-11-10T04:01:00Z",
                    None,
                    None,
                    "[]",
                    "[]",
                    None,
                ),
                (
                    "m3",
                    "架空の推定食事",
                    "2026-11-10T05:00:00Z",
                    "2026-11-10T05:01:00Z",
                    None,
                    None,
                    "[]",
                    "[]",
                    None,
                ),
                (
                    "deleted",
                    "削除済み",
                    "2026-11-10T05:00:00Z",
                    "2026-11-10",
                    None,
                    "p4",
                    "[]",
                    "[]",
                    "2026-11-10",
                ),
                (
                    "outside",
                    "期間外",
                    "2026-11-10T15:00:00Z",
                    "2026-11-11",
                    None,
                    "p4",
                    "[]",
                    "[]",
                    None,
                ),
            ]
        ],
    )
    connection.executemany(
        "INSERT INTO nutrition_estimates (id,meal_id,model,analyzed_at,calories_kcal,protein_grams,fat_grams,carbohydrate_grams,input_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
            row + ("fixture-hash", row[3])
            for row in [
                ("old", "m1", "model-old", "2026-11-10T04:00:00Z", 500, 10, 20, 70),
                ("new", "m1", "model-new", "2026-11-10T06:00:00Z", 550, 15, 20, 70),
                ("tie", "m1", "model-tie", "2026-11-10T06:00:00Z", 600, 20, 20, 80),
                ("m3-estimate", "m3", "model", "2026-11-10T06:00:00Z", 400, 20, 10, 60),
            ]
        ],
    )
    connection.executemany(
        "INSERT INTO meal_photos (id,object_key,content_type,client_id,upload_token_hash,upload_expires_at,created_at) VALUES (?,?,?,?,?,?,?)",
        [
            row + (row[0], "fixture-hash", "2099-01-01", "2026-11-10")
            for row in [
                ("p1", "meals/a.jpg", "image/jpeg"),
                ("p2", "meals/b.png", "image/png"),
                ("p3", "meals/c.webp", "image/webp"),
                ("p4", "meals/excluded.png", "image/png"),
            ]
        ],
    )
    connection.commit()
    return connection


class SQLiteD1Reader:
    def __init__(self, connection):
        self.connection = connection

    def query(self, sql, params):
        return [dict(row) for row in self.connection.execute(sql, params)]


class RecordTests(unittest.TestCase):
    def setUp(self):
        self.connection = fixture()
        self.addCleanup(self.connection.close)

    def read(self):
        return health.read_records(
            SQLiteD1Reader(self.connection), date(2026, 11, 10), date(2026, 11, 10)
        )

    def test_jst_range_deleted_records_units_and_latest_estimate(self):
        records = self.read()
        self.assertEqual([row["id"] for row in records["weights"]], ["start", "last"])
        self.assertEqual(records["weights"][0]["weightKg"], 65)
        self.assertEqual(records["weights"][0]["bodyFatPercent"], 14.5)
        meals = records["meals"]
        self.assertEqual([row["id"] for row in meals], ["m1", "m2", "m3"])
        self.assertEqual(meals[0]["estimate"]["model"], "model-tie")
        self.assertEqual(meals[0]["caloriesKcal"], 0)
        self.assertEqual(meals[0]["caloriesSource"], "manual")
        self.assertEqual(meals[0]["tags"], ["昼食"])
        self.assertIsNone(meals[1]["estimate"])
        self.assertIsNone(meals[1]["caloriesKcal"])
        self.assertIsNone(meals[1]["caloriesSource"])
        self.assertEqual(meals[2]["caloriesKcal"], 400)
        self.assertEqual(meals[2]["caloriesSource"], "estimate")

    def test_all_photos_keep_meal_and_display_order(self):
        records = self.read()
        self.assertEqual(records["meals"][0]["photoIds"], ["p1", "p2", "p3"])
        self.assertEqual(
            [(p["mealId"], p["photoId"], p["position"]) for p in records["photos"]],
            [("m1", "p1", 0), ("m1", "p2", 1), ("m1", "p3", 2)],
        )

    def test_queries_work_with_database_writes_denied(self):
        def read_only(action, *unused):
            return (
                sqlite3.SQLITE_DENY
                if action
                in {sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE}
                else sqlite3.SQLITE_OK
            )

        self.connection.set_authorizer(read_only)
        self.assertEqual(len(self.read()["meals"]), 3)

    def test_photo_download_uses_get_and_keeps_full_mapping(self):
        records = self.read()
        client = boto3.client(
            "s3",
            endpoint_url="https://example.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        with Stubber(client) as stubber, tempfile.TemporaryDirectory() as directory:
            for photo in records["photos"]:
                contents = photo["photoId"].encode()
                stubber.add_response(
                    "get_object",
                    {"Body": StreamingBody(io.BytesIO(contents), len(contents))},
                    {"Bucket": "test-photos", "Key": photo["objectKey"]},
                )
            health.download_photos(
                records, client, "test-photos", Path(directory) / "photos"
            )
            for photo in records["photos"]:
                self.assertEqual(
                    Path(photo["localPath"]).read_bytes(), photo["photoId"].encode()
                )
            self.assertEqual(
                [Path(p["localPath"]).suffix for p in records["photos"]],
                [".jpg", ".png", ".webp"],
            )
            stubber.assert_no_pending_responses()

    def test_photo_failure_is_not_reported_as_success(self):
        records = self.read()
        client = boto3.client(
            "s3",
            endpoint_url="https://example.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        with Stubber(client) as stubber, tempfile.TemporaryDirectory() as directory:
            stubber.add_client_error(
                "get_object", service_error_code="AccessDenied", http_status_code=403
            )
            with self.assertRaises(health.ClientError):
                health.download_photos(
                    records, client, "test-photos", Path(directory) / "photos"
                )


class HttpFlowTests(unittest.TestCase):
    def setUp(self):
        self.connection = fixture()
        self.requests = []
        self.api_error = False
        test = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                test.requests.append(
                    {
                        "path": self.path,
                        "authorization": self.headers["Authorization"],
                        **body,
                    }
                )
                rows = [
                    dict(row)
                    for row in test.connection.execute(body["sql"], body["params"])
                ]
                payload = (
                    {
                        "success": False,
                        "errors": [{"message": "private upstream content"}],
                    }
                    if test.api_error
                    else {
                        "success": True,
                        "result": [{"success": True, "results": rows}],
                    }
                )
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode())

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.connection.close)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.environment = {
            "LIFE_CONSOLE_ACCOUNT_ID": "test-account",
            "LIFE_CONSOLE_D1_DATABASE_ID": "test-db",
            "LIFE_CONSOLE_D1_READ_TOKEN": "test-secret",
        }

    def test_cli_reads_http_sql_and_saves_report_outside_skill(self):
        with (
            tempfile.TemporaryDirectory() as directory,
            patch.object(
                health, "D1_API", f"http://127.0.0.1:{self.server.server_port}"
            ),
            patch.dict("os.environ", self.environment, clear=True),
            redirect_stdout(io.StringIO()) as output,
        ):
            code = health.main(
                [
                    "--from",
                    "2026-11-10",
                    "--to",
                    "2026-11-10",
                    "--output-dir",
                    directory,
                ]
            )
            self.assertEqual(code, 0)
            summary = json.loads(output.getvalue())
            report = json.loads(Path(summary["report"]).read_text())
            self.assertEqual(summary["meals"], 3)
            self.assertEqual(summary["photos"], 3)
            self.assertFalse(summary["photosDownloaded"])
            self.assertEqual(report["meals"][0]["photoIds"], ["p1", "p2", "p3"])
            self.assertNotIn("test-secret", Path(summary["report"]).read_text())
        self.assertEqual(len(self.requests), 3)
        for request in self.requests:
            self.assertEqual(
                request["path"], "/accounts/test-account/d1/database/test-db/query"
            )
            self.assertEqual(request["authorization"], "Bearer test-secret")
            self.assertEqual(
                request["params"],
                ["2026-11-10T00:00:00+09:00", "2026-11-11T00:00:00+09:00"],
            )

    def test_cli_downloads_actual_png_and_reports_paths_for_all_photos(self):
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII="
        )
        self.connection.execute("UPDATE meal_photos SET content_type = 'image/png'")
        client = boto3.client(
            "s3",
            endpoint_url="https://example.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id="test",
            aws_secret_access_key="test",
        )
        environment = {
            **self.environment,
            "LIFE_CONSOLE_R2_BUCKET": "test-photos",
            "LIFE_CONSOLE_R2_READ_ACCESS_KEY_ID": "r2-test-key",
            "LIFE_CONSOLE_R2_READ_SECRET_ACCESS_KEY": "r2-test-secret",
        }
        with (
            Stubber(client) as stubber,
            tempfile.TemporaryDirectory() as directory,
            patch.object(
                health, "D1_API", f"http://127.0.0.1:{self.server.server_port}"
            ),
            patch.dict("os.environ", environment, clear=True),
            patch.object(health.boto3, "client", return_value=client) as make_client,
            redirect_stdout(io.StringIO()) as output,
        ):
            for key in ["meals/a.jpg", "meals/b.png", "meals/c.webp"]:
                stubber.add_response(
                    "get_object",
                    {"Body": StreamingBody(io.BytesIO(png), len(png))},
                    {"Bucket": "test-photos", "Key": key},
                )
            self.assertEqual(
                health.main(
                    [
                        "--from",
                        "2026-11-10",
                        "--to",
                        "2026-11-10",
                        "--photos",
                        "--output-dir",
                        directory,
                    ]
                ),
                0,
            )
            summary = json.loads(output.getvalue())
            report_text = Path(summary["report"]).read_text()
            records = json.loads(report_text)
            self.assertTrue(summary["photosDownloaded"])
            self.assertEqual(
                [p["photoId"] for p in records["photos"]], ["p1", "p2", "p3"]
            )
            for photo in records["photos"]:
                self.assertEqual(Path(photo["localPath"]).read_bytes(), png)
            self.assertNotIn("r2-test-secret", report_text)
            make_client.assert_called_once_with(
                "s3",
                endpoint_url="https://test-account.r2.cloudflarestorage.com",
                region_name="auto",
                aws_access_key_id="r2-test-key",
                aws_secret_access_key="r2-test-secret",
            )
            stubber.assert_no_pending_responses()

    def test_d1_failure_is_nonzero_without_upstream_body_or_credentials(self):
        self.api_error = True
        with (
            patch.object(
                health, "D1_API", f"http://127.0.0.1:{self.server.server_port}"
            ),
            patch.dict("os.environ", self.environment, clear=True),
            redirect_stdout(io.StringIO()) as output,
            redirect_stderr(io.StringIO()) as errors,
        ):
            self.assertEqual(
                health.main(["--from", "2026-11-10", "--to", "2026-11-10"]), 1
            )
            self.assertEqual(output.getvalue(), "")
            self.assertNotIn("private upstream content", errors.getvalue())
            self.assertNotIn("test-secret", errors.getvalue())


class InputTests(unittest.TestCase):
    def test_date_is_strict_and_range_reversed_fails_before_network(self):
        for text in ["20261110", "2026-02-30", "2026-11-10T00:00:00Z"]:
            with self.assertRaises(argparse.ArgumentTypeError):
                health.parse_date(text)
        with redirect_stderr(io.StringIO()) as errors:
            self.assertEqual(
                health.main(["--from", "2026-11-11", "--to", "2026-11-10"]), 1
            )
            self.assertIn("--from", errors.getvalue())

    def test_missing_configuration_does_not_access_network(self):
        with (
            patch.dict("os.environ", {}, clear=True),
            redirect_stderr(io.StringIO()) as errors,
        ):
            self.assertEqual(
                health.main(["--from", "2026-11-10", "--to", "2026-11-10"]), 1
            )
            self.assertIn("LIFE_CONSOLE_ACCOUNT_ID", errors.getvalue())


if __name__ == "__main__":
    unittest.main()
