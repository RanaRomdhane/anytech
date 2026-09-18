import asyncio
import hashlib
import hmac
import json
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

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
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai_service import generate_sales_draft
from app.config import settings
from app.db import SessionLocal, get_db
from app.dependencies import CompanyContext, company_context, current_user, require_admin
from app.events import emit_event
from app.models import (
    AIRun,
    AuditLog,
    AuthSession,
    Company,
    Conversation,
    ConversationMode,
    Customer,
    Membership,
    Message,
    Order,
    OrderItem,
    OrderStatus,
    OutboxEvent,
    Product,
    ProductVariant,
    RealtimeEvent,
    Role,
    User,
    WebhookEvent,
)
from app.schemas import (
    AIDraftOut,
    AIRunOut,
    AIStatusOut,
    AnalyticsOut,
    AuditOut,
    CompanyOut,
    CompanyUpdate,
    ConfirmOrder,
    ConversationAction,
    ConversationDetailOut,
    ConversationOut,
    CustomerOut,
    HealthOut,
    IntegrationOut,
    LoginIn,
    LoginOut,
    MembershipOut,
    MeOut,
    MessageCreate,
    MessageOut,
    OrderCancel,
    OrderCreate,
    OrderOut,
    OrderTransition,
    PaginatedProducts,
    ProductCreate,
    ProductOut,
    QuoteCreate,
    QuoteOut,
    TeamMemberOut,
)
from app.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_expiry,
    verify_password,
)
from app.services import (
    audit,
    cancel_order,
    confirm_order,
    create_order,
    quote_order,
    transition_order,
)


def serialize_user(db: Session, user: User) -> MeOut:
    memberships = db.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        memberships=[MembershipOut.model_validate(item) for item in memberships],
    )


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    return (
        forwarded.split(",")[0].strip()
        if forwarded
        else request.client.host
        if request.client
        else ""
    )[:80]


def _set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    common = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(
        "access_token",
        access_token,
        max_age=settings.access_token_minutes * 60,
        **common,
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        **common,
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def _new_session(db: Session, user: User, request: Request, family_id: uuid.UUID | None = None):
    refresh_token, token_hash = create_refresh_token()
    session = AuthSession(
        user_id=user.id,
        family_id=family_id or uuid.uuid4(),
        token_hash=token_hash,
        expires_at=refresh_expiry(),
        user_agent=request.headers.get("User-Agent", "")[:300],
        ip_address=_client_ip(request),
    )
    db.add(session)
    db.flush()
    return session, refresh_token


def seed_demo() -> None:
    if not settings.demo_mode:
        return
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == "admin@anytech.tn"))
        if user is None:
            company = Company(name="AnyTech")
            user = User(
                email="admin@anytech.tn",
                full_name="Rana AnyTech",
                password_hash=hash_password("AnytechDemo2026!"),
            )
            db.add_all([company, user])
            db.flush()
            db.add(Membership(company_id=company.id, user_id=user.id, role=Role.COMPANY_ADMIN))
        else:
            membership = db.scalar(select(Membership).where(Membership.user_id == user.id))
            if membership is None:
                return
            company = db.get(Company, membership.company_id)
            if company is None:
                return

        if company.name == "AnyTech Demo":
            company.name = "AnyTech"

        if db.scalar(
            select(func.count()).select_from(Product).where(Product.company_id == company.id)
        ):
            return

        products = [
            Product(
                company_id=company.id, name="Atlas Pro", description="Sneakers urbaines légères"
            ),
            Product(
                company_id=company.id,
                name="Sahara Tote",
                description="Sac quotidien en toile renforcée",
            ),
            Product(
                company_id=company.id, name="Noura Linen", description="Chemise en lin respirant"
            ),
        ]
        variants = [
            ProductVariant(
                company_id=company.id,
                sku="ATL-NOI-38",
                attributes={"couleur": "Noir", "taille": "38"},
                price_minor=137900,
                stock_on_hand=12,
            ),
            ProductVariant(
                company_id=company.id,
                sku="SAH-NAT",
                attributes={"couleur": "Naturel"},
                price_minor=89000,
                stock_on_hand=7,
            ),
            ProductVariant(
                company_id=company.id,
                sku="NOU-BLE-M",
                attributes={"couleur": "Bleu", "taille": "M"},
                price_minor=119500,
                stock_on_hand=2,
            ),
        ]
        for product, variant in zip(products, variants, strict=True):
            product.variants.append(variant)
        db.add_all(products)
        db.flush()

        customers = [
            Customer(
                company_id=company.id, name="Meriem Khelifi", phone="+216 20 100 101", city="Tunis"
            ),
            Customer(
                company_id=company.id, name="Youssef Zayani", phone="+216 22 200 202", city="Sfax"
            ),
            Customer(
                company_id=company.id, name="Sarra Ayadi", phone="+216 55 300 303", city="Sousse"
            ),
        ]
        db.add_all(customers)
        db.flush()
        conversations = [
            Conversation(
                company_id=company.id, customer_id=customers[0].id, mode=ConversationMode.AI_ACTIVE
            ),
            Conversation(
                company_id=company.id, customer_id=customers[1].id, mode=ConversationMode.AI_ACTIVE
            ),
            Conversation(
                company_id=company.id, customer_id=customers[2].id, mode=ConversationMode.AI_PAUSED
            ),
        ]
        db.add_all(conversations)
        db.flush()
        db.add_all(
            [
                Message(
                    company_id=company.id,
                    conversation_id=conversations[0].id,
                    external_id="demo-message-1",
                    direction="inbound",
                    sender_type="customer",
                    body="Merci, je confirme la commande.",
                ),
                Message(
                    company_id=company.id,
                    conversation_id=conversations[1].id,
                    external_id="demo-message-2",
                    direction="inbound",
                    sender_type="customer",
                    body="Le modèle noir est disponible ?",
                ),
                Message(
                    company_id=company.id,
                    conversation_id=conversations[2].id,
                    external_id="demo-message-3",
                    direction="inbound",
                    sender_type="customer",
                    body="Nheb taille 38, livraison à Sousse.",
                ),
            ]
        )
        orders = [
            Order(
                company_id=company.id,
                customer_id=customers[0].id,
                conversation_id=conversations[0].id,
                status=OrderStatus.CONFIRMED,
                total_minor=137900,
            ),
            Order(
                company_id=company.id,
                customer_id=customers[1].id,
                conversation_id=conversations[1].id,
                status=OrderStatus.PREPARING,
                total_minor=89000,
            ),
            Order(
                company_id=company.id,
                customer_id=customers[2].id,
                conversation_id=conversations[2].id,
                status=OrderStatus.READY_FOR_DELIVERY,
                total_minor=119500,
            ),
        ]
        db.add_all(orders)
        db.flush()
        db.add_all(
            [
                OrderItem(
                    order_id=order.id,
                    company_id=company.id,
                    variant_id=variant.id,
                    sku=variant.sku,
                    product_name=product.name,
                    quantity=1,
                    unit_price_minor=variant.price_minor,
                )
                for order, product, variant in zip(orders, products, variants, strict=True)
            ]
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env == "development" and get_db not in app.dependency_overrides:
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


@app.middleware("http")
async def cookie_origin_middleware(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and (
        request.cookies.get("access_token") or request.cookies.get("refresh_token")
    ):
        origin = request.headers.get("Origin")
        same_origin = str(request.base_url).rstrip("/")
        if origin and origin.rstrip("/") not in {*settings.origins, same_origin}:
            return JSONResponse(
                status_code=403,
                content={
                    "error": {
                        "code": "UNTRUSTED_ORIGIN",
                        "message": "Request origin is not allowed",
                        "details": {},
                        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
                    }
                },
            )
    return await call_next(request)


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
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user.id)
    _, refresh_token = _new_session(db, user, request)
    db.commit()
    _set_session_cookies(response, token, refresh_token)
    return LoginOut(user=serialize_user(db, user), access_token=token)


@auth.post("/auth/refresh", response_model=LoginOut)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    supplied = request.cookies.get("refresh_token")
    if not supplied:
        raise HTTPException(status_code=401, detail="Invalid session")
    session = db.scalar(
        select(AuthSession)
        .where(AuthSession.token_hash == hash_refresh_token(supplied))
        .with_for_update()
    )
    now = datetime.now(UTC)
    if session is None:
        _clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if session.revoked_at is not None:
        db.query(AuthSession).filter(AuthSession.family_id == session.family_id).update(
            {AuthSession.revoked_at: now}
        )
        db.commit()
        _clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Session reuse detected")
    if expires_at <= now:
        session.revoked_at = now
        db.commit()
        _clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Session expired")
    user = db.get(User, session.user_id)
    if user is None or not user.active:
        session.revoked_at = now
        db.commit()
        _clear_session_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid session")
    replacement, refresh_token = _new_session(db, user, request, session.family_id)
    session.revoked_at = now
    session.last_used_at = now
    session.replaced_by = replacement.id
    access_token = create_access_token(user.id)
    db.commit()
    _set_session_cookies(response, access_token, refresh_token)
    return LoginOut(user=serialize_user(db, user), access_token=access_token)


@auth.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    supplied = request.cookies.get("refresh_token")
    if supplied:
        session = db.scalar(
            select(AuthSession).where(AuthSession.token_hash == hash_refresh_token(supplied))
        )
        if session and session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
            db.commit()
    _clear_session_cookies(response)


@auth.get("/me", response_model=MeOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return serialize_user(db, user)


workspace = APIRouter(prefix="/api/v1/companies/{company_id}", tags=["Workspace"])


@workspace.get("/settings", response_model=CompanyOut)
def get_settings(context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)):
    company = db.get(Company, context.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@workspace.patch("/settings", response_model=CompanyOut)
def update_settings(
    payload: CompanyUpdate,
    context: CompanyContext = Depends(require_admin),
    db: Session = Depends(get_db),
):
    company = db.get(Company, context.company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    company.name = payload.name.strip()
    company.currency = payload.currency
    company.timezone = payload.timezone
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action="company.settings.updated",
        resource_type="company",
        resource_id=company.id,
    )
    emit_event(
        db,
        company_id=context.company_id,
        event_type="company.updated",
        resource_id=company.id,
    )
    db.commit()
    db.refresh(company)
    return company


@workspace.get("/customers", response_model=list[CustomerOut])
def list_customers(
    q: str | None = Query(default=None, max_length=200),
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    statement = select(Customer).where(Customer.company_id == context.company_id)
    if q:
        value = f"%{q}%"
        statement = statement.where(
            or_(Customer.name.ilike(value), Customer.phone.ilike(value), Customer.city.ilike(value))
        )
    return db.scalars(statement.order_by(Customer.updated_at.desc()).limit(100)).all()


@workspace.get("/team", response_model=list[TeamMemberOut])
def list_team(context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.company_id == context.company_id)
        .order_by(Membership.created_at)
    ).all()
    return [
        TeamMemberOut(
            user_id=user.id,
            full_name=user.full_name,
            email=user.email,
            role=membership.role,
            active=user.active,
            joined_at=membership.created_at,
        )
        for membership, user in rows
    ]


@workspace.get("/analytics/summary", response_model=AnalyticsOut)
def analytics_summary(
    context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)
):
    company_id = context.company_id
    conversations = db.scalars(
        select(Conversation).where(Conversation.company_id == company_id)
    ).all()
    orders = db.scalars(select(Order).where(Order.company_id == company_id)).all()
    confirmed_states = {
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_DELIVERY,
        OrderStatus.SENT_TO_DELIVERY,
        OrderStatus.PICKED_UP,
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED,
    }
    confirmed = sum(order.status in confirmed_states for order in orders)
    return AnalyticsOut(
        customers=db.scalar(
            select(func.count()).select_from(Customer).where(Customer.company_id == company_id)
        )
        or 0,
        products=db.scalar(
            select(func.count()).select_from(Product).where(Product.company_id == company_id)
        )
        or 0,
        conversations=len(conversations),
        human_conversations=sum(
            conversation.mode == ConversationMode.HUMAN_ACTIVE for conversation in conversations
        ),
        orders=len(orders),
        confirmed_orders=confirmed,
        delivered_orders=sum(order.status == OrderStatus.DELIVERED for order in orders),
        order_value_minor=sum(
            order.total_minor for order in orders if order.status != OrderStatus.CANCELLED
        ),
        low_stock_variants=db.scalar(
            select(func.count())
            .select_from(ProductVariant)
            .where(
                ProductVariant.company_id == company_id,
                ProductVariant.active.is_(True),
                ProductVariant.stock_on_hand - ProductVariant.stock_reserved < 5,
            )
        )
        or 0,
        conversion_rate=round(confirmed / len(conversations) * 100, 1) if conversations else 0,
    )


@workspace.get("/integrations", response_model=list[IntegrationOut])
def integration_status(context: CompanyContext = Depends(company_context)):
    del context
    whatsapp_ready = bool(
        settings.whatsapp_app_secret
        and settings.whatsapp_verify_token
        and settings.whatsapp_phone_number_id
    )
    llm_ready = bool(settings.llm_provider and settings.llm_model and settings.llm_api_key)
    carrier_ready = bool(settings.carrier_provider and settings.carrier_api_key)
    return [
        IntegrationOut(
            key="whatsapp",
            name="WhatsApp Business",
            configured=whatsapp_ready,
            detail="Canal connecté" if whatsapp_ready else "Identifiants requis",
        ),
        IntegrationOut(
            key="llm",
            name="Assistant IA",
            configured=llm_ready,
            detail=(
                f"{settings.llm_provider} · {settings.llm_model}"
                if llm_ready
                else "Fournisseur à connecter"
            ),
        ),
        IntegrationOut(
            key="carrier",
            name="Transporteur",
            configured=carrier_ready,
            detail=settings.carrier_provider if carrier_ready else "Transporteur à sélectionner",
        ),
    ]


@workspace.get("/ai/status", response_model=AIStatusOut)
def ai_status(context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)):
    runs = db.scalars(
        select(AIRun)
        .where(AIRun.company_id == context.company_id)
        .order_by(AIRun.created_at.desc())
    ).all()
    return AIStatusOut(
        configured=bool(settings.llm_provider and settings.llm_model and settings.llm_api_key),
        provider=settings.llm_provider or None,
        model=settings.llm_model or None,
        monthly_budget_minor=settings.llm_monthly_budget_minor,
        spent_minor=0,
        run_count=len(runs),
        successful_runs=sum(run.status == "completed" for run in runs),
        prompt_tokens=sum(run.prompt_tokens for run in runs),
        completion_tokens=sum(run.completion_tokens for run in runs),
    )


@workspace.get("/ai/runs", response_model=list[AIRunOut])
def list_ai_runs(context: CompanyContext = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(
        select(AIRun)
        .where(AIRun.company_id == context.company_id)
        .order_by(AIRun.created_at.desc())
        .limit(50)
    ).all()


@workspace.get("/audit", response_model=list[AuditOut])
def list_audit(context: CompanyContext = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(
        select(AuditLog)
        .where(AuditLog.company_id == context.company_id)
        .order_by(AuditLog.created_at.desc())
        .limit(50)
    ).all()


@workspace.get("/deliveries", response_model=list[OrderOut])
def list_deliveries(
    context: CompanyContext = Depends(company_context), db: Session = Depends(get_db)
):
    delivery_states = {
        OrderStatus.READY_FOR_DELIVERY,
        OrderStatus.SENT_TO_DELIVERY,
        OrderStatus.PICKED_UP,
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED,
        OrderStatus.FAILED_DELIVERY,
        OrderStatus.RETURNED,
    }
    return (
        db.scalars(
            select(Order)
            .where(Order.company_id == context.company_id, Order.status.in_(delivery_states))
            .order_by(Order.updated_at.desc())
        )
        .unique()
        .all()
    )


@workspace.get("/events")
async def stream_events(
    request: Request,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    cursor = datetime.now(UTC)
    resync = False
    if last_event_id:
        try:
            previous = db.scalar(
                select(RealtimeEvent).where(
                    RealtimeEvent.id == uuid.UUID(last_event_id),
                    RealtimeEvent.company_id == context.company_id,
                )
            )
        except ValueError:
            previous = None
        if previous:
            cursor = previous.created_at
            if cursor.tzinfo is None:
                cursor = cursor.replace(tzinfo=UTC)
        else:
            resync = True

    async def generate():
        nonlocal cursor
        yield "retry: 3000\n\n"
        if resync:
            yield 'data: {"type":"resync.required"}\n\n'
        while not await request.is_disconnected():
            with SessionLocal() as event_db:
                if event_db.bind and event_db.bind.dialect.name == "postgresql":
                    event_db.execute(
                        text("select set_config('app.current_company_id', :company_id, true)"),
                        {"company_id": str(context.company_id)},
                    )
                events = event_db.scalars(
                    select(RealtimeEvent)
                    .where(
                        RealtimeEvent.company_id == context.company_id,
                        RealtimeEvent.created_at > cursor,
                    )
                    .order_by(RealtimeEvent.created_at)
                    .limit(100)
                ).all()
                for event in events:
                    created_at = event.created_at
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=UTC)
                    cursor = max(cursor, created_at)
                    data = {
                        "event_id": str(event.id),
                        "type": event.event_type,
                        "resource_id": str(event.resource_id) if event.resource_id else None,
                        "version": event.version,
                        "timestamp": created_at.isoformat(),
                        **event.payload,
                    }
                    yield f"id: {event.id}\ndata: {json.dumps(data)}\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    emit_event(
        db,
        company_id=context.company_id,
        event_type="product.created",
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
    rows = db.execute(
        select(Conversation, Customer.name)
        .join(Customer, Customer.id == Conversation.customer_id)
        .where(
            Conversation.company_id == context.company_id,
            Customer.company_id == context.company_id,
        )
        .order_by(Conversation.updated_at.desc())
        .limit(100)
    ).all()
    return [
        ConversationOut.model_validate(conversation).model_copy(update={"customer_name": name})
        for conversation, name in rows
    ]


@messaging.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
def conversation_detail(
    conversation_id: uuid.UUID,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    row = db.execute(
        select(Conversation, Customer)
        .join(Customer, Customer.id == Conversation.customer_id)
        .where(
            Conversation.id == conversation_id,
            Conversation.company_id == context.company_id,
            Customer.company_id == context.company_id,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conversation, customer = row
    messages = db.scalars(
        select(Message)
        .where(
            Message.company_id == context.company_id,
            Message.conversation_id == conversation.id,
        )
        .order_by(Message.created_at)
        .limit(200)
    ).all()
    return ConversationDetailOut(
        conversation=ConversationOut.model_validate(conversation).model_copy(
            update={"customer_name": customer.name}
        ),
        customer=CustomerOut.model_validate(customer),
        messages=[MessageOut.model_validate(message) for message in messages],
    )


@messaging.post(
    "/conversations/{conversation_id}/ai-draft",
    response_model=AIDraftOut,
)
async def create_ai_draft(
    conversation_id: uuid.UUID,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    if not settings.llm_api_key or not settings.llm_model or not settings.llm_provider:
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.company_id == context.company_id,
        )
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    run = await generate_sales_draft(
        db,
        company_id=context.company_id,
        conversation=conversation,
        actor_id=context.user.id,
    )
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action="ai.draft.generated" if run.status == "completed" else "ai.draft.failed",
        resource_type="ai_run",
        resource_id=run.id,
        details={"model": run.model, "prompt_version": run.prompt_version},
    )
    emit_event(
        db,
        company_id=context.company_id,
        event_type="ai.draft.completed" if run.status == "completed" else "ai.draft.failed",
        resource_id=run.id,
        payload={"conversation_id": str(conversation.id)},
    )
    db.commit()
    db.refresh(run)
    if run.status != "completed":
        raise HTTPException(status_code=503, detail="AI provider is unavailable")
    return AIDraftOut(
        run_id=run.id,
        content=run.draft,
        model=run.model,
        prompt_tokens=run.prompt_tokens,
        completion_tokens=run.completion_tokens,
        created_at=run.created_at,
    )


@messaging.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=201,
)
def create_outbound_message(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.company_id == context.company_id,
        )
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    existing = db.scalar(
        select(Message).where(
            Message.company_id == context.company_id,
            Message.client_message_id == payload.client_message_id,
        )
    )
    if existing:
        if existing.conversation_id != conversation_id or existing.body != payload.body.strip():
            raise HTTPException(status_code=409, detail="Client message ID reused")
        return existing
    channel_ready = bool(
        settings.whatsapp_access_token
        and settings.whatsapp_phone_number_id
        and settings.whatsapp_app_secret
    )
    message = Message(
        company_id=context.company_id,
        conversation_id=conversation.id,
        client_message_id=payload.client_message_id,
        direction="outbound",
        sender_type="staff",
        body=payload.body.strip(),
        status="queued" if channel_ready else "draft",
    )
    db.add(message)
    db.flush()
    if channel_ready:
        db.add(
            OutboxEvent(
                topic="whatsapp.message.send",
                aggregate_id=message.id,
                payload={
                    "company_id": str(context.company_id),
                    "conversation_id": str(conversation.id),
                    "message_id": str(message.id),
                },
            )
        )
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action="message.queued" if channel_ready else "message.draft.saved",
        resource_type="message",
        resource_id=message.id,
    )
    emit_event(
        db,
        company_id=context.company_id,
        event_type="message.created",
        resource_id=message.id,
        payload={"conversation_id": str(conversation.id), "status": message.status},
    )
    db.commit()
    db.refresh(message)
    return message


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
    emit_event(
        db,
        company_id=context.company_id,
        event_type="conversation.updated",
        resource_id=conversation.id,
        version=conversation.version,
        payload={"mode": conversation.mode.value},
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
    emit_event(
        db,
        company_id=context.company_id,
        event_type="order.created",
        resource_id=order.id,
        version=order.version,
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
    emit_event(
        db,
        company_id=context.company_id,
        event_type="order.updated",
        resource_id=order.id,
        version=order.version,
        payload={"status": order.status.value},
    )
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
    emit_event(
        db,
        company_id=context.company_id,
        event_type="order.updated",
        resource_id=order.id,
        version=order.version,
        payload={"status": order.status.value},
    )
    db.commit()
    db.refresh(order)
    return order


@orders.post("/orders/{order_id}/transitions", response_model=OrderOut)
def transition(
    order_id: uuid.UUID,
    payload: OrderTransition,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    order = scoped_order(db, context.company_id, order_id)
    transition_order(
        db,
        order,
        target=OrderStatus(payload.target_status),
        expected_version=payload.expected_version,
        actor_id=context.user.id,
    )
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action=f"order.{order.status.value.lower()}",
        resource_type="order",
        resource_id=order.id,
    )
    emit_event(
        db,
        company_id=context.company_id,
        event_type="order.updated",
        resource_id=order.id,
        version=order.version,
        payload={"status": order.status.value},
    )
    db.commit()
    db.refresh(order)
    return order


@orders.post("/orders/{order_id}/cancel", response_model=OrderOut)
def cancel(
    order_id: uuid.UUID,
    payload: OrderCancel,
    context: CompanyContext = Depends(company_context),
    db: Session = Depends(get_db),
):
    order = scoped_order(db, context.company_id, order_id)
    cancel_order(
        db,
        order,
        reason=payload.reason,
        expected_version=payload.expected_version,
        actor_id=context.user.id,
    )
    audit(
        db,
        company_id=context.company_id,
        actor_id=context.user.id,
        action="order.cancelled",
        resource_type="order",
        resource_id=order.id,
        details={"reason": payload.reason},
    )
    emit_event(
        db,
        company_id=context.company_id,
        event_type="order.updated",
        resource_id=order.id,
        version=order.version,
        payload={"status": order.status.value},
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
app.include_router(workspace)
app.include_router(catalog)
app.include_router(messaging)
app.include_router(orders)
app.include_router(webhooks)
