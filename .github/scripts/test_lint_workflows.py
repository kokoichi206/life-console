import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("lint_workflows", Path(__file__).with_name("lint-workflows.py"))
lint_workflows = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lint_workflows)

VALID_WORKFLOW = """name: ci
on:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Check
        run: echo ok
"""


class WorkflowLintTest(unittest.TestCase):
    def test_valid_workflow(self):
        self.assertEqual(lint_workflows.lint_workflow(VALID_WORKFLOW, "ci.yml"), [])

    def test_all_conventions_report_the_source_line(self):
        source = VALID_WORKFLOW.replace("name: ci", "name: CI").replace("    timeout-minutes: 5\n", "").replace(
            "\n\n      - name: Check\n", "\n      - name: ''\n"
        )
        violations = lint_workflows.lint_workflow(source, "ci.yaml")
        self.assertEqual(len(violations), 4)
        self.assertEqual([line for line, _ in violations], [1, 6, 10, 10])

    def test_whitespace_only_step_name(self):
        source = VALID_WORKFLOW.replace("name: Check\n", "name: '  '\n")
        self.assertEqual(len(lint_workflows.lint_workflow(source, "ci.yml")), 1)

    def test_name_line_after_header_comments(self):
        source = "# Header\n\n" + VALID_WORKFLOW.replace("name: ci", "name: wrong")
        self.assertEqual(lint_workflows.lint_workflow(source, "ci.yml")[0][0], 3)

    def test_empty_timeout_is_missing(self):
        source = VALID_WORKFLOW.replace("timeout-minutes: 5", "timeout-minutes:")
        self.assertEqual(len(lint_workflows.lint_workflow(source, "ci.yml")), 1)

    def test_reusable_workflow_does_not_need_timeout(self):
        source = "name: ci\njobs:\n  check:\n    uses: org/repo/.github/workflows/ci.yml@main\n"
        self.assertEqual(lint_workflows.lint_workflow(source, "ci.yml"), [])

    def test_comments_and_yaml_inside_shell_are_not_steps(self):
        source = VALID_WORKFLOW.replace("        uses: actions/checkout@v6", """        run: |
          cat <<'EOF'
          jobs:
            example:
              steps:
                - run: echo example
          EOF""").replace("      - name: Check", "      # Keep this explanation near the command.\n      - name: Check")
        self.assertEqual(lint_workflows.lint_workflow(source, "ci.yml"), [])

    def test_comments_do_not_replace_a_blank_line(self):
        source = VALID_WORKFLOW.replace("\n\n      - name: Check", "\n      # Explanation\n      - name: Check")
        self.assertEqual(len(lint_workflows.lint_workflow(source, "ci.yml")), 1)

    def test_unindented_step_sequence_and_crlf(self):
        source = VALID_WORKFLOW.replace("      -", "    -").replace("        uses", "      uses").replace(
            "        run", "      run"
        ).replace("\n", "\r\n")
        self.assertEqual(lint_workflows.lint_workflow(source, "ci.yml"), [])

    def test_annotation_escaping(self):
        self.assertEqual(lint_workflows.annotation_escape("%,:\r\n"), "%25%2C%3A%0D%0A")
