import hashlib
import hmac
import uuid
from contextlib import asynccontextmanager

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Base, SessionLocal, engine, get_db
from app.dependencies import CompanyContext, company_context, current_user, require_admin
from app.models import (
    AuditLog,
    Company,
    Conversation,
    ConversationMode,
    Membership,
    Order,
    OutboxEvent,
    Product,
    ProductVariant,
    Role,
    User,
    WebhookEvent,
)
from app.schemas import (
    ConfirmOrder,
    ConversationAction,
    ConversationOut,
    HealthOut,
    LoginIn,
    LoginOut,
    MembershipOut,
    MeOut,
    OrderCreate,
    OrderOut,
    PaginatedProducts,
    ProductCreate,
    ProductOut,
    QuoteCreate,
    QuoteOut,
)
from app.security import create_access_token, hash_password, verify_password
from app.services import audit, confirm_order, create_order, quote_order


def serialize_user(db: Session, user: User) -> MeOut:
    memberships = db.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        memberships=[MembershipOut.model_validate(item) for item in memberships],
    )


def seed_demo() -> None:
    if not settings.demo_mode:
        return
    with SessionLocal.begin() as db:
        if db.scalar(select(func.count()).select_from(User)):
            return
        company = Company(name="AnyTech Demo")
        user = User(
            email="admin@anytech.tn",
            full_name="Rana AnyTech",
            password_hash=hash_password("AnytechDemo2026!"),
        )
        db.add_all([company, user])
        db.flush()
        db.add(Membership(company_id=company.id, user_id=user.id, role=Role.COMPANY_ADMIN))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env == "development":
        Base.metadata.create_all(engine)
        seed_demo()
    yield


app = FastAPI(
    title="AnyTech AI Social Commerce API",
    version="0.1.0",
    description="Tenant-safe commerce operations for social conversations.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "If-Match", "X-CSRF-Token"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    messages = {
        401: "Authentication required",
        403: "You do not have access to this operation",
        404: "Resource not found",
        409: str(exc.detail),
        429: "Too many requests",
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": str(exc.detail).upper().replace(" ", "_"),
                "message": messages.get(exc.status_code, str(exc.detail)),
                "details": {},
                "request_id": request.state.request_id,
            }
        },
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request is invalid",
                "details": {"fields": exc.errors()},
                "request_id": request.state.request_id,
            }
        },
    )


@app.get("/health", response_model=HealthOut, tags=["Operations"])
def health() -> HealthOut:
    return HealthOut(status="ok", service="api", environment=settings.app_env)


auth = APIRouter(prefix="/api/v1", tags=["Identity"])


@auth.post("/auth/login", response_model=LoginOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user.id)
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_minutes * 60,
        path="/",
    )
    return LoginOut(user=serialize_user(db, user), access_token=token)


@auth.post("/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie("access_token", path="/")


@auth.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return serialize_user(db, user)


catalog = APIRouter(prefix="/api/v1/companies/{company_id}", tags=["Catalogue"])


@catalog.get("/products", response_model=PaginatedProducts)
def list_products(
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=25, ge=1, le=100),
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    statement = select(Product).where(Product.company_id == context.company_id)
    if q:
        statement = statement.where(
            or_(Product.name.ilike(f"%{q}%"), Product.description.ilike(f"%{q}%"))
        )
    items = db.scalars(statement.order_by(Product.updated_at.desc()).limit(limit)).unique().all()
    return PaginatedProducts(items=[ProductOut.model_validate(item) for item in items])


@catalog.post("/products", response_model=ProductOut, status_code=201)
def add_product(
    payload: ProductCreate,
    context: CompanyContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = Product(
        company_id=context.company_id, name=payload.name, description=payload.description
    )
    product.variants.append(
        ProductVariant(company_id=context.company_id, **payload.variant.model_dump())
    )
    db.add(product)
    try:
        db.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="SKU already exists") from exc
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action="product.created",
        resource_type="product",
        resource_id=product.id,
    )
    db.commit()
    db.refresh(product)
    return ProductOut.model_validate(product)


messaging = APIRouter(prefix="/api/v1/companies/{company_id}", tags=["Conversations"])


@messaging.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)
):
    return db.scalars(
        select(Conversation)
        .where(Conversation.company_id == context.company_id)
        .order_by(Conversation.updated_at.desc())
        .limit(100)
    ).all()


def _change_mode(
    db: Session,
    context: CompanyContext,
    conversation_id: uuid.UUID,
    payload: ConversationAction,
    mode: ConversationMode,
) -> Conversation:
    conversation = db.scalar(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.company_id == context.company_id,
        )
        .with_for_update()
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.version != payload.expected_version:
        raise HTTPException(status_code=409, detail="Conversation changed")
    conversation.mode = mode
    conversation.assigned_user_id = (
        context.user.id if mode == ConversationMode.HUMAN_ACTIVE else None
    )
    conversation.version += 1
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action=f"conversation.{mode.value.lower()}",
        resource_type="conversation",
        resource_id=conversation.id,
    )
    db.commit()
    db.refresh(conversation)
    return conversation


@messaging.post("/conversations/{conversation_id}/takeover", response_model=ConversationOut)
def takeover(
    conversation_id: uuid.UUID,
    payload: ConversationAction,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    return _change_mode(db, context, conversation_id, payload, ConversationMode.HUMAN_ACTIVE)


@messaging.post("/conversations/{conversation_id}/return-to-ai", response_model=ConversationOut)
def return_to_ai(
    conversation_id: uuid.UUID,
    payload: ConversationAction,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    return _change_mode(db, context, conversation_id, payload, ConversationMode.AI_ACTIVE)


orders = APIRouter(prefix="/api/v1/companies/{company_id}", tags=["Orders"])


def scoped_order(db: Session, company_id: uuid.UUID, order_id: uuid.UUID) -> Order:
    order = db.scalar(
        select(Order).where(Order.id == order_id, Order.company_id == company_id).with_for_update()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@orders.get("/orders", response_model=list[OrderOut])
def list_orders(context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)):
    return (
        db.scalars(
            select(Order)
            .where(Order.company_id == context.company_id)
            .order_by(Order.updated_at.desc())
            .limit(100)
        )
        .unique()
        .all()
    )


@orders.post("/orders", response_model=OrderOut, status_code=201)
def add_order(
    payload: OrderCreate,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    order = create_order(db, context.company_id, payload)
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action="order.created",
        resource_type="order",
        resource_id=order.id,
    )
    db.commit()
    db.refresh(order)
    return order


@orders.post("/orders/{order_id}/quote", response_model=QuoteOut)
def add_quote(
    order_id: uuid.UUID,
    payload: QuoteCreate,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    order = scoped_order(db, context.company_id, order_id)
    quote = quote_order(db, order, payload.delivery_minor)
    db.commit()
    db.refresh(quote)
    return quote


@orders.post("/orders/{order_id}/confirm", response_model=OrderOut)
def confirm(
    order_id: uuid.UUID,
    payload: ConfirmOrder,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=200),
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    existing = db.scalar(
        select(AuditLog).where(
            AuditLog.company_id == context.company_id,
            AuditLog.action == "order.confirmed",
            AuditLog.details["idempotency_key"].as_string() == idempotency_key,
        )
    )
    if existing and existing.resource_id == order_id:
        return scoped_order(db, context.company_id, order_id)
    if existing:
        raise HTTPException(status_code=409, detail="Idempotency key reused")
    order = scoped_order(db, context.company_id, order_id)
    confirm_order(db, order, payload, context.user.id)
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action="order.confirmed",
        resource_type="order",
        resource_id=order.id,
        details={"idempotency_key": idempotency_key},
    )
    db.commit()
    db.refresh(order)
    return order


webhooks = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@webhooks.get("/whatsapp")
def verify_whatsapp(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode != "subscribe" or not hmac.compare_digest(
        hub_verify_token, settings.whatsapp_verify_token
    ):
        raise HTTPException(status_code=403, detail="Webhook verification failed")
    return Response(content=hub_challenge, media_type="text/plain")


@webhooks.post("/whatsapp", status_code=202)
async def ingest_whatsapp(
    request: Request,
    signature: str | None = Header(default=None, alias="X-Hub-Signature-256"),
    db: Session = Depends(get_db),
):
    raw = await request.body()
    expected = (
        "sha256=" + hmac.new(settings.whatsapp_app_secret.encode(), raw, hashlib.sha256).hexdigest()
    )
    if (
        not signature
        or not settings.whatsapp_app_secret
        or not hmac.compare_digest(signature, expected)
    ):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")
    payload = await request.json()
    external_id = request.headers.get("X-Meta-Delivery-ID") or hashlib.sha256(raw).hexdigest()
    event = WebhookEvent(provider="whatsapp", external_id=external_id, payload=payload)
    db.add(event)
    try:
        db.flush()
        db.add(
            OutboxEvent(
                topic="whatsapp.event.received",
                aggregate_id=event.id,
                payload={"webhook_event_id": str(event.id)},
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"status": "accepted"}


app.include_router(auth)
app.include_router(catalog)
app.include_router(messaging)
app.include_router(orders)
app.include_router(webhooks)
