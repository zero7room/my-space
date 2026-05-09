from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_has_linear_revision_chain() -> None:
    config = Config("alembic.ini")
    script = ScriptDirectory.from_config(config)

    heads = script.get_heads()

    assert heads == ["0003_m4_alert_record"]

    initial_revision = script.get_revision("0001_init")
    assert initial_revision is not None
    assert initial_revision.down_revision is None

    m1_revision = script.get_revision("0002_m1_data_domain")
    assert m1_revision is not None
    assert m1_revision.down_revision == "0001_init"

    m4_revision = script.get_revision("0003_m4_alert_record")
    assert m4_revision is not None
    assert m4_revision.down_revision == "0002_m1_data_domain"
    assert Path("alembic/env.py").exists()
