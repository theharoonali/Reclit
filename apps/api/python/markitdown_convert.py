"""One file or one YouTube URL -> markdown, for the `convert-to-markdown` task.

Usage:
  markitdown_convert.py --path <local file> --name <original filename>
  markitdown_convert.py --url <youtube url>

Prints exactly one JSON line on stdout: {"markdown", "title", "version"}.
On failure, prints the reason on stderr and exits 1. The TypeScript side
fetches every file itself (size cap, timeout) and hands this script a local
path, so the only URL markitdown ever opens is a YouTube one.
"""

import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--path")
    source.add_argument("--url")
    parser.add_argument("--name", default=None)
    args = parser.parse_args()

    try:
        from markitdown import MarkItDown, StreamInfo, __version__

        converter = MarkItDown(enable_plugins=False)
        if args.url:
            result = converter.convert_uri(args.url)
        else:
            name = args.name or os.path.basename(args.path)
            extension = os.path.splitext(name)[1] or None
            with open(args.path, "rb") as stream:
                result = converter.convert_stream(
                    stream,
                    stream_info=StreamInfo(filename=name, extension=extension),
                )
    except Exception as error:  # noqa: BLE001 - every failure is reported, not raised
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1

    payload = {
        "markdown": result.markdown or "",
        "title": result.title,
        "version": __version__,
    }
    # ensure_ascii keeps stdout ASCII whatever the platform's console encoding.
    sys.stdout.write(json.dumps(payload, ensure_ascii=True))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
