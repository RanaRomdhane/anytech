import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditLog,
    Order,
    OrderItem,
    OrderQuote,
    OrderStatus,
    OrderStatusHistory,
    Product,
    ProductVariant,
)
from app.schemas import ConfirmOrder, OrderCreate


def audit(
    db: Session,
    *,
    company_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            company_id=company_id,
            actor_id=actor_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
    )


def create_order(db: Session, company_id: uuid.UUID, payload: OrderCreate) -> Order:
    order = Order(
        company_id=company_id,
        customer_id=payload.customer_id,
        conversation_id=payload.conversation_id,
    )
    db.add(order)
    for requested in payload.items:
        variant = db.scalar(
            select(ProductVariant)
            .where(
                ProductVariant.id == requested.variant_id,
                ProductVariant.company_id == company_id,
                ProductVariant.active.is_(True),
            )
            .with_for_update()
        )
        if variant is None:
            raise HTTPException(status_code=404, detail="Variant not found")
        product = db.scalar(
            select(Product).where(
                Product.id == variant.product_id, Product.company_id == company_id
            )
        )
        order.items.append(
            OrderItem(
                company_id=company_id,
                variant_id=variant.id,
                sku=variant.sku,
                product_name=product.name if product else variant.sku,
                quantity=requested.quantity,
                unit_price_minor=variant.effective_price_minor,
            )
        )
    order.total_minor = sum(item.quantity * item.unit_price_minor for item in order.items)
    db.flush()
    return order


def quote_order(db: Session, order: Order, delivery_minor: int) -> OrderQuote:
    if order.status not in {OrderStatus.DRAFT, OrderStatus.WAITING_CONFIRMATION}:
        raise HTTPException(status_code=409, detail="Order cannot be quoted")
    next_version = max((quote.version for quote in order.quotes), default=0) + 1
    snapshot = [
        {
            "variant_id": str(item.variant_id),
            "sku": item.sku,
            "name": item.product_name,
            "quantity": item.quantity,
            "unit_price_minor": item.unit_price_minor,
        }
        for item in order.items
    ]
    subtotal = sum(item["quantity"] * item["unit_price_minor"] for item in snapshot)
    quote = OrderQuote(
        company_id=order.company_id,
        version=next_version,
        items_snapshot=snapshot,
        delivery_minor=delivery_minor,
        total_minor=subtotal + delivery_minor,
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    order.quotes.append(quote)
    order.status = OrderStatus.WAITING_CONFIRMATION
    order.delivery_minor = delivery_minor
    order.total_minor = quote.total_minor
    order.version += 1
    db.flush()
    return quote


def confirm_order(db: Session, order: Order, payload: ConfirmOrder, actor_id: uuid.UUID) -> Order:
    if order.status != OrderStatus.WAITING_CONFIRMATION:
        raise HTTPException(status_code=409, detail="Order is not awaiting confirmation")
    quote = db.scalar(
        select(OrderQuote).where(
            OrderQuote.order_id == order.id,
            OrderQuote.company_id == order.company_id,
            OrderQuote.version == payload.quote_version,
        )
    )
    latest_version = max((item.version for item in order.quotes), default=0)
    if quote is None or quote.version != latest_version:
        raise HTTPException(status_code=409, detail="Quote changed")
    expires_at = quote.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=409, detail="Quote expired")

    for item in order.items:
        variant = db.scalar(
            select(ProductVariant)
            .where(
                ProductVariant.id == item.variant_id,
                ProductVariant.company_id == order.company_id,
            )
            .with_for_update()
        )
        if variant is None or variant.available_stock < item.quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Insufficient stock for {item.sku}",
            )
        if variant.effective_price_minor != item.unit_price_minor:
            raise HTTPException(status_code=409, detail="Price changed")
        variant.stock_reserved += item.quantity
        variant.version += 1

    previous = order.status.value
    order.status = OrderStatus.CONFIRMED
    order.confirmation_evidence = {
        "type": payload.evidence_type,
        "id": payload.evidence_id,
        "quote_version": quote.version,
        "confirmed_at": datetime.now(UTC).isoformat(),
    }
    order.version += 1
    db.add(
        OrderStatusHistory(
            company_id=order.company_id,
            order_id=order.id,
            from_status=previous,
            to_status=order.status.value,
            actor_id=actor_id,
        )
    )
    db.flush()
    return order


def transition_order(
    db: Session,
    order: Order,
    *,
    target: OrderStatus,
    expected_version: int,
    actor_id: uuid.UUID,
) -> Order:
    if order.version != expected_version:
        raise HTTPException(status_code=409, detail="Order changed")
    allowed = {
        OrderStatus.CONFIRMED: OrderStatus.PREPARING,
        OrderStatus.PREPARING: OrderStatus.READY_FOR_DELIVERY,
    }
    if allowed.get(order.status) != target:
        raise HTTPException(status_code=409, detail="Order transition is not allowed")
    previous = order.status
    order.status = target
    order.version += 1
    db.add(
        OrderStatusHistory(
            company_id=order.company_id,
            order_id=order.id,
            from_status=previous.value,
            to_status=target.value,
            actor_id=actor_id,
        )
    )
    db.flush()
    return order


def cancel_order(
    db: Session,
    order: Order,
    *,
    reason: str,
    expected_version: int,
    actor_id: uuid.UUID,
) -> Order:
    if order.version != expected_version:
        raise HTTPException(status_code=409, detail="Order changed")
    cancellable = {
        OrderStatus.DRAFT,
        OrderStatus.WAITING_CONFIRMATION,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_DELIVERY,
    }
    if order.status not in cancellable:
        raise HTTPException(status_code=409, detail="Order cannot be cancelled")
    if order.status in {
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_DELIVERY,
    }:
        for item in order.items:
            variant = db.scalar(
                select(ProductVariant)
                .where(
                    ProductVariant.id == item.variant_id,
                    ProductVariant.company_id == order.company_id,
                )
                .with_for_update()
            )
            if variant is None or variant.stock_reserved < item.quantity:
                raise HTTPException(status_code=409, detail="Reserved stock is inconsistent")
            variant.stock_reserved -= item.quantity
            variant.version += 1
    previous = order.status
    order.status = OrderStatus.CANCELLED
    order.version += 1
    db.add(
        OrderStatusHistory(
            company_id=order.company_id,
            order_id=order.id,
            from_status=previous.value,
            to_status=OrderStatus.CANCELLED.value,
            actor_id=actor_id,
        )
    )
    db.flush()
    return order
