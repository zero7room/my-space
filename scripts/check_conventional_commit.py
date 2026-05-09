from __future__ import annotations

import re
import sys
from pathlib import Path

PATTERN = re.compile(
    r"^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9._-]+\))?!?: .+"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_conventional_commit.py <commit-msg-file>", file=sys.stderr)
        return 2

    message_path = Path(sys.argv[1])
    if not message_path.exists():
        print(f"commit message file not found: {message_path}", file=sys.stderr)
        return 2

    lines = message_path.read_text(encoding="utf-8").splitlines()
    first_line = lines[0].strip() if lines else ""
    if PATTERN.match(first_line):
        return 0

    print(
        "Commit message must follow Conventional Commits, e.g. "
        "'feat(scope): add baseline'.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
