"""Run the Studio CLI with Python distributions that isolate their import path."""

import sys
from pathlib import Path


def main() -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from studio.cli import main as studio_main

    return studio_main()


if __name__ == "__main__":
    raise SystemExit(main())
