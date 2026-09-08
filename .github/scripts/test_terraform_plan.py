import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "terraform_plan", Path(__file__).with_name("check-terraform-plan.py")
)
terraform_plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(terraform_plan)


class TerraformPlanTest(unittest.TestCase):
    def test_updates_and_creates_are_allowed(self):
        plan = {
            "resource_changes": [
                {"address": "module.worker.app", "change": {"actions": ["update"]}},
                {"address": "module.policy.owner", "change": {"actions": ["create"]}},
            ]
        }
        self.assertEqual(terraform_plan.destructive_resources(plan), [])

    def test_deleting_a_module_is_rejected_without_lifecycle_configuration(self):
        plan = {
            "resource_changes": [
                {"address": "module.database.db", "change": {"actions": ["delete"]}}
            ]
        }
        self.assertEqual(terraform_plan.destructive_resources(plan), ["module.database.db"])

    def test_replacement_is_rejected_in_both_orders(self):
        for actions in [["delete", "create"], ["create", "delete"]]:
            with self.subTest(actions=actions):
                plan = {
                    "resource_changes": [
                        {"address": "module.worker.app", "change": {"actions": actions}}
                    ]
                }
                self.assertEqual(terraform_plan.destructive_resources(plan), ["module.worker.app"])

    def test_no_changes_are_allowed(self):
        self.assertEqual(terraform_plan.destructive_resources({}), [])
