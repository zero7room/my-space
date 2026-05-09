from __future__ import annotations

import json
from pathlib import Path

from app.main import app


def main() -> None:
    Path("openapi.json").write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
