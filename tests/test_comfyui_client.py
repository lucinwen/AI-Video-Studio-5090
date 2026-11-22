import unittest

from studio.comfyui_client import ComfyUIClient


class ArtifactTests(unittest.TestCase):
    def test_extracts_images_and_videos(self):
        entry = {
            "outputs": {
                "10": {"images": [{"filename": "frame.png", "subfolder": "a", "type": "output"}]},
                "20": {"gifs": [{"filename": "clip.mp4", "subfolder": "", "type": "output"}]},
            }
        }
        artifacts = ComfyUIClient.artifacts_from_history(entry)
        self.assertEqual(
            [(item.kind, item.filename) for item in artifacts],
            [("image", "frame.png"), ("video", "clip.mp4")],
        )


if __name__ == "__main__":
    unittest.main()
