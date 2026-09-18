import uuid
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Membership, Role, User
from app.security import decode_access_token


@dataclass(frozen=True)
class CompanyContext:
    company_id: uuid.UUID
    user: User
    role: Role


def _credentials(request: Request, authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return request.cookies.get("access_token")


def current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = _credentials(request, authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    try:
        user_id = decode_access_token(token)
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session"
        ) from exc
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    return user


def company_context(
    company_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> CompanyContext:
    if db.bind and db.bind.dialect.name == "postgresql":
        db.execute(
            text("select set_config('app.current_company_id', :company_id, true)"),
            {"company_id": str(company_id)},
        )
    membership = db.scalar(
        select(Membership).where(Membership.company_id == company_id, Membership.user_id == user.id)
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return CompanyContext(company_id=company_id, user=user, role=membership.role)


def require_admin(context: CompanyContext = Depends(company_context)) -> CompanyContext:
    if context.role != Role.COMPANY_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator required")
    return context
