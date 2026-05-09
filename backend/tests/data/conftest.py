from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.data.base import metadata


@pytest.fixture()
def engine() -> Generator[Engine, None, None]:
    test_engine = create_engine("sqlite+pysqlite:///:memory:")
    with test_engine.connect() as connection:
        connection.execute(text("ATTACH DATABASE ':memory:' AS app"))
    metadata.create_all(test_engine)
    try:
        yield test_engine
    finally:
        metadata.drop_all(test_engine)
        test_engine.dispose()


@pytest.fixture()
def session(engine: Engine) -> Generator[Session, None, None]:
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with session_factory() as db_session:
        yield db_session
