import json
import tempfile
import unittest
from pathlib import Path

from studio.errors import RegistryError
from studio.workflow import apply_bindings, safe_slug, validate_api_workflow


class WorkflowTests(unittest.TestCase):
    def test_bindings_copy_graph_and_cast_values(self):
        graph = {"1": {"class_type": "KSampler", "inputs": {"seed": 1}}}
        result = apply_bindings(
            graph,
            [{"node_id": "1", "input": "seed", "source": "seed", "cast": "int"}],
            {"seed": "42"},
        )
        self.assertEqual(result["1"]["inputs"]["seed"], 42)
        self.assertEqual(graph["1"]["inputs"]["seed"], 1)

    def test_missing_node_fails(self):
        with self.assertRaises(RegistryError):
            apply_bindings({}, [{"node_id": "9", "input": "text", "source": "prompt"}], {"prompt": "x"})

    def test_missing_required_context_fails(self):
        graph = {"1": {"class_type": "CLIPTextEncode", "inputs": {"text": ""}}}
        with self.assertRaises(RegistryError):
            apply_bindings(graph, [{"node_id": "1", "input": "text", "source": "prompt"}], {})

    def test_safe_slug(self):
        self.assertEqual(safe_slug("my project / 01"), "my-project-01")
        with self.assertRaises(RegistryError):
            safe_slug("///")

    def test_api_workflow_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "workflow.json"
            path.write_text(json.dumps({"1": {"class_type": "SaveImage", "inputs": {"filename_prefix": "test"}}}))
            graph = validate_api_workflow(path, [])
            self.assertIn("1", graph)
            with self.assertRaises(RegistryError):
                validate_api_workflow(path, [{"node_id": "1", "input": "missing", "source": "x"}])


if __name__ == "__main__":
    unittest.main()
