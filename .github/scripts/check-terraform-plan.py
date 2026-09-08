import json
import sys


def destructive_resources(plan: dict) -> list[str]:
    return [
        resource["address"]
        for resource in plan.get("resource_changes", [])
        if "delete" in resource["change"]["actions"]
    ]


def main() -> int:
    # module ごと消した場合は prevent_destroy が効かないため、適用前にも確認する。
    resources = destructive_resources(json.load(sys.stdin))
    if resources:
        print("削除・置き換えを含むため、自動 apply を停止します:", file=sys.stderr)
        for address in resources:
            print(address, file=sys.stderr)
        return 1
    print("削除・置き換えなし。保存済み plan を適用できます。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
