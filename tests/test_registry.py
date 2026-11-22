import json
import tempfile
import unittest
from pathlib import Path

from studio.errors import RegistryError
from studio.registry import load_registry


class RegistryTests(unittest.TestCase):
    def test_enabled_workflow_rejects_path_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            outside = root.parent / "outside-workflow.json"
            outside.write_text(json.dumps({"1": {"class_type": "SaveImage", "inputs": {}}}))
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps({
                "schema_version": 1,
                "workflows": {
                    "text_to_image": {
                        "enabled": True,
                        "api_workflow": "../outside-workflow.json",
                        "bindings": []
                    }
                }
            }))
            with self.assertRaises(RegistryError):
                load_registry(registry_path, root)

    def test_disabled_template_does_not_require_workflow_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps({
                "schema_version": 1,
                "workflows": {
                    "text_to_image": {
                        "enabled": False,
                        "api_workflow": "not-yet-created.json",
                        "bindings": []
                    }
                }
            }))
            loaded = load_registry(registry_path, root)
            self.assertFalse(loaded["workflows"]["text_to_image"]["enabled"])


if __name__ == "__main__":
    unittest.main()
