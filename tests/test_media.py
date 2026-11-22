import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from studio.errors import PipelineError
from studio.media import probe_and_decode


class MediaTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = Path(temporary.name) / "test clip.webm"
        self.path.write_bytes(b"media fixture")

    @patch("studio.media.subprocess.run")
    def test_probe_returns_metadata_and_maps_video_and_optional_audio_for_decode(self, run):
        streams = [{"codec_type": "video", "codec_name": "vp9"}, {"codec_type": "audio"}]
        format_info = {"duration": "1.375000"}
        run.side_effect = [
            subprocess.CompletedProcess([], 0, json.dumps({"streams": streams, "format": format_info}), ""),
            subprocess.CompletedProcess([], 0, "", ""),
        ]

        result = probe_and_decode(self.path, "video", Path("ffprobe"), Path("ffmpeg"))

        self.assertEqual(result, {"format": format_info, "streams": streams, "decode_exit": 0})
        decode = run.call_args.args[0]
        self.assertIn("-xerror", decode)
        self.assertIn("0:v", decode)
        self.assertIn("0:a?", decode)
        self.assertEqual(decode[-3:], ["-f", "null", "-"])

    @patch("studio.media.subprocess.run")
    def test_empty_media_is_rejected_before_probe(self, run):
        self.path.write_bytes(b"")
        with self.assertRaisesRegex(PipelineError, "Missing or empty"):
            probe_and_decode(self.path, "image", Path("ffprobe"), Path("ffmpeg"))
        run.assert_not_called()

    @patch("studio.media.subprocess.run")
    def test_decode_error_fails_even_after_successful_probe(self, run):
        run.side_effect = [
            subprocess.CompletedProcess([], 0, '{"streams":[{"codec_type":"video"}],"format":{}}', ""),
            subprocess.CompletedProcess([], 1, "", "Invalid data found when processing input"),
        ]
        with self.assertRaisesRegex(PipelineError, "Invalid data found"):
            probe_and_decode(self.path, "video", Path("ffprobe"), Path("ffmpeg"))
