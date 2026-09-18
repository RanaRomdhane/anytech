import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import app
from app.db import Base, get_db
from app.models import Company, Membership, Role, User
from app.security import create_access_token, hash_password


@pytest.fixture
def db() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with session_factory() as session:
        yield session
    Base.metadata.drop_all(engine)


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def tenant(db: Session) -> dict:
    company = Company(name="Demo Commerce")
    other_company = Company(name="Other Commerce")
    admin = User(
        email="owner@example.com",
        full_name="Owner",
        password_hash=hash_password("strong-password"),
    )
    outsider = User(
        email="outsider@example.com",
        full_name="Outsider",
        password_hash=hash_password("strong-password"),
    )
    db.add_all([company, other_company, admin, outsider])
    db.flush()
    db.add_all(
        [
            Membership(company_id=company.id, user_id=admin.id, role=Role.COMPANY_ADMIN),
            Membership(
                company_id=other_company.id,
                user_id=outsider.id,
                role=Role.COMPANY_ADMIN,
            ),
        ]
    )
    db.commit()
    return {
        "company": company,
        "other_company": other_company,
        "admin": admin,
        "outsider": outsider,
        "admin_headers": {"Authorization": f"Bearer {create_access_token(admin.id)}"},
        "outsider_headers": {"Authorization": f"Bearer {create_access_token(outsider.id)}"},
        "request_id": str(uuid.uuid4()),
    }
