import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import ConversationMode, OrderStatus, Role


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class MembershipOut(StrictModel):
    company_id: uuid.UUID
    role: Role


class MeOut(StrictModel):
    id: uuid.UUID
    email: str
    full_name: str
    memberships: list[MembershipOut]


class LoginIn(StrictModel):
    email: str
    password: str = Field(min_length=8, max_length=128)


class LoginOut(StrictModel):
    user: MeOut
    access_token: str
    token_type: str = "bearer"


class VariantCreate(StrictModel):
    sku: str = Field(min_length=1, max_length=100)
    attributes: dict[str, Any] = Field(default_factory=dict)
    price_minor: int = Field(ge=0)
    sale_price_minor: int | None = Field(default=None, ge=0)
    stock_on_hand: int = Field(default=0, ge=0)


class VariantOut(StrictModel):
    id: uuid.UUID
    sku: str
    attributes: dict[str, Any]
    price_minor: int
    sale_price_minor: int | None
    stock_on_hand: int
    stock_reserved: int
    available_stock: int
    version: int
    active: bool


class ProductCreate(StrictModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    variant: VariantCreate


class ProductOut(StrictModel):
    id: uuid.UUID
    name: str
    description: str
    active: bool
    variants: list[VariantOut]
    created_at: datetime
    updated_at: datetime


class PaginatedProducts(StrictModel):
    items: list[ProductOut]
    next_cursor: str | None = None


class ConversationOut(StrictModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    channel: str
    mode: ConversationMode
    assigned_user_id: uuid.UUID | None
    version: int
    updated_at: datetime


class ConversationAction(StrictModel):
    expected_version: int = Field(ge=1)


class OrderItemCreate(StrictModel):
    variant_id: uuid.UUID
    quantity: int = Field(ge=1, le=1000)


class OrderCreate(StrictModel):
    customer_id: uuid.UUID | None = None
    conversation_id: uuid.UUID | None = None
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderItemOut(StrictModel):
    id: uuid.UUID
    variant_id: uuid.UUID
    sku: str
    product_name: str
    quantity: int
    unit_price_minor: int


class OrderOut(StrictModel):
    id: uuid.UUID
    status: OrderStatus
    currency: str
    delivery_minor: int
    total_minor: int
    version: int
    items: list[OrderItemOut]
    created_at: datetime
    updated_at: datetime


class QuoteCreate(StrictModel):
    delivery_minor: int = Field(ge=0)


class QuoteOut(StrictModel):
    id: uuid.UUID
    version: int
    items_snapshot: list[dict[str, Any]]
    delivery_minor: int
    total_minor: int
    expires_at: datetime


class ConfirmOrder(StrictModel):
    quote_version: int = Field(ge=1)
    evidence_type: str = Field(pattern="^(staff|customer_message)$")
    evidence_id: str = Field(min_length=1, max_length=200)


class HealthOut(StrictModel):
    status: str
    service: str
    environment: str


class ErrorBody(StrictModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: str


class ErrorResponse(StrictModel):
    error: ErrorBody
