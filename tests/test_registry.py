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

    def test_media_validation_resolves_tools_inside_studio_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "studio"
            root.mkdir()
            tools = root / "tools"
            tools.mkdir()
            (tools / "ffprobe.exe").touch()
            (tools / "ffmpeg.exe").touch()
            outside = root.parent / "ffmpeg.exe"
            outside.touch()
            registry_path = root / "registry.json"
            settings = {
                "schema_version": 1,
                "workflows": {},
                "media_validation": {"ffprobe": "tools/ffprobe.exe", "ffmpeg": "tools/ffmpeg.exe"},
            }
            registry_path.write_text(json.dumps(settings), encoding="utf-8")
            self.assertEqual(
                load_registry(registry_path, root)["media_validation"]["ffprobe"],
                (tools / "ffprobe.exe").resolve(),
            )
            for invalid_path in ("../ffmpeg.exe", str(outside.resolve()), "missing.exe"):
                with self.subTest(invalid_path=invalid_path), self.assertRaisesRegex(
                    RegistryError, r"media_validation.ffmpeg"
                ):
                    settings["media_validation"]["ffmpeg"] = invalid_path
                    registry_path.write_text(json.dumps(settings), encoding="utf-8")
                    load_registry(registry_path, root)


if __name__ == "__main__":
    unittest.main()
