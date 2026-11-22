import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from unittest.mock import patch

from studio.comfyui_client import ComfyUIClient
from studio.errors import ComfyUIError


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

    def test_extracts_native_video_outputs_from_images(self):
        entry = {
            "outputs": {
                "47": {
                    "images": [
                        {
                            "filename": "clip.webm",
                            "subfolder": "previews",
                            "type": "output",
                            "metadata": {"kind": "video"},
                        },
                        {"filename": "clip.MP4", "type": "output"},
                        {"filename": "preview.gif", "metadata": {"kind": "video"}},
                        {"filename": "keyframe.jpg"},
                    ],
                    "animated": [True],
                }
            }
        }
        artifacts = ComfyUIClient.artifacts_from_history(entry)
        self.assertEqual(
            [(item.kind, item.filename) for item in artifacts],
            [
                ("video", "clip.webm"),
                ("video", "clip.MP4"),
                ("video", "preview.gif"),
                ("image", "keyframe.jpg"),
            ],
        )
        self.assertEqual(artifacts[0].subfolder, "previews")
        self.assertEqual(artifacts[0].folder_type, "output")
        self.assertEqual(artifacts[0].node_id, "47")


class CompletionTests(unittest.TestCase):
    def test_reports_error_before_completed_flag(self):
        client = ComfyUIClient()
        entry = {"status": {"status_str": "error", "completed": True}, "outputs": {}}
        with patch.object(client, "get_history", return_value=entry):
            with self.assertRaisesRegex(ComfyUIError, r"Workflow sample failed"):
                client.wait_for_completion("sample")


class TransportTests(unittest.TestCase):
    def test_rejects_unsupported_endpoints(self):
        for url in (
            "http://192.0.2.1:8188",
            "http://localhost:8188",
            "https://127.0.0.1:8188",
            "http://user@127.0.0.1:8188",
            "http://127.0.0.1:invalid",
            "http://127.0.0.1:8188?query",
        ):
            with self.subTest(url=url), self.assertRaisesRegex(ComfyUIError, "http://127.0.0.1"):
                ComfyUIClient(url)

    def test_loopback_request_ignores_proxy_and_does_not_follow_redirect(self):
        class RedirectHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/system_stats":
                    self.send_response(302)
                    self.send_header("Location", "/moved")
                    self.end_headers()
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b"{}")

            def log_message(self, format, *args):
                pass

        with ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler) as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                with (
                    patch("urllib.request.getproxies", return_value={"http": "http://127.0.0.1:1"}),
                    patch("urllib.request.proxy_bypass", return_value=False),
                ):
                    client = ComfyUIClient(f"http://127.0.0.1:{server.server_port}", timeout=2)
                    with self.assertRaisesRegex(ComfyUIError, "HTTP 302 for /system_stats"):
                        client.health()
            finally:
                server.shutdown()
                thread.join()


if __name__ == "__main__":
    unittest.main()
