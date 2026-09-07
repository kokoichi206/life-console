# /// script
# requires-python = ">=3.11"
# dependencies = ["ruamel.yaml==0.18.16"]
# ///

from pathlib import Path
import sys
import unittest

from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError


def lint_workflow(source: str, filename: str) -> list[tuple[int, str]]:
    workflow = YAML().load(source)
    violations = []
    if workflow.get("name") != Path(filename).stem:
        line = workflow.lc.key("name")[0] + 1 if "name" in workflow else 1
        violations.append((line, "トップレベル name をファイル名（拡張子なし）と一致させてください"))

    lines = source.splitlines()
    for job_name, job in workflow["jobs"].items():
        # reusable workflow の呼び出し job は timeout-minutes を指定できない。
        if "uses" not in job and job.get("timeout-minutes") is None:
            violations.append((job.lc.line + 1, f"job '{job_name}' に timeout-minutes がありません"))

        for index, step in enumerate(job.get("steps", [])):
            line = step.lc.line
            if not isinstance(step.get("name"), str) or not step["name"].strip():
                violations.append((line + 1, "空でない step name を指定してください"))
            if index == 0:
                continue

            previous_line = line - 1
            # step の直前に理由コメントを置いても、その前の空行を区切りとして認める。
            while previous_line >= 0 and lines[previous_line].lstrip().startswith("#"):
                previous_line -= 1
            if previous_line >= 0 and lines[previous_line].strip():
                violations.append((line + 1, "step の間に空行がありません"))
    return violations


def annotation_escape(text: str) -> str:
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A").replace(":", "%3A").replace(",", "%2C")


def main() -> int:
    workflow_dir = Path(__file__).resolve().parents[1] / "workflows"
    failed = False
    for path in sorted([*workflow_dir.glob("*.yml"), *workflow_dir.glob("*.yaml")]):
        try:
            violations = lint_workflow(path.read_text(), path.name)
        except YAMLError as error:
            violations = [(1, f"YAML を解析できません: {error}")]
        for line, message in violations:
            filename = f".github/workflows/{path.name}"
            print(f"::error file={annotation_escape(filename)},line={line}::{annotation_escape(message)}")
            failed = True
    return int(failed)


if __name__ == "__main__":
    if sys.argv[1:] == ["--test"]:
        suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent), pattern="test_*.py")
        sys.exit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
    sys.exit(main())
