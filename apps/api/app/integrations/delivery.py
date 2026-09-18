from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class DeliveryAddress:
    name: str
    phone: str
    address: str
    city: str
    governorate: str


@dataclass(frozen=True)
class DeliveryItem:
    sku: str
    name: str
    quantity: int
    unit_price_minor: int


@dataclass(frozen=True)
class DeliveryPrice:
    amount_minor: int
    currency: str
    service_code: str
    valid_until: datetime | None = None


@dataclass(frozen=True)
class ShipmentReceipt:
    provider_reference: str
    tracking_number: str
    status: str


@dataclass(frozen=True)
class ShipmentEvent:
    status: str
    occurred_at: datetime
    description: str


class DeliveryProvider(Protocol):
    """Carrier boundary. Implementations must make request keys replay-safe."""

    def calculate_price(
        self, address: DeliveryAddress, items: list[DeliveryItem]
    ) -> DeliveryPrice: ...

    def create_shipment(
        self,
        address: DeliveryAddress,
        items: list[DeliveryItem],
        merchant_reference: str,
        request_key: str,
    ) -> ShipmentReceipt: ...

    def get_shipment(self, provider_reference: str) -> ShipmentReceipt: ...

    def track_shipment(self, provider_reference: str) -> list[ShipmentEvent]: ...

    def cancel_shipment(self, provider_reference: str, request_key: str) -> str: ...


class SandboxDeliveryProvider:
    """Deterministic local adapter; never enabled for a production connection."""

    def __init__(self) -> None:
        self._shipments: dict[str, ShipmentReceipt] = {}
        self._request_keys: dict[str, str] = {}

    def calculate_price(self, address: DeliveryAddress, items: list[DeliveryItem]) -> DeliveryPrice:
        del items
        amount = 8_000 if address.governorate.lower() in {"tunis", "ariana"} else 10_000
        return DeliveryPrice(amount_minor=amount, currency="TND", service_code="COD_STANDARD")

    def create_shipment(
        self,
        address: DeliveryAddress,
        items: list[DeliveryItem],
        merchant_reference: str,
        request_key: str,
    ) -> ShipmentReceipt:
        del address, items
        existing_reference = self._request_keys.get(request_key)
        if existing_reference:
            return self._shipments[existing_reference]
        reference = f"sandbox-{merchant_reference}"
        receipt = ShipmentReceipt(
            provider_reference=reference,
            tracking_number=f"AT-{merchant_reference[-8:].upper()}",
            status="accepted",
        )
        self._request_keys[request_key] = reference
        self._shipments[reference] = receipt
        return receipt

    def get_shipment(self, provider_reference: str) -> ShipmentReceipt:
        return self._shipments[provider_reference]

    def track_shipment(self, provider_reference: str) -> list[ShipmentEvent]:
        receipt = self.get_shipment(provider_reference)
        return [ShipmentEvent(receipt.status, datetime.now().astimezone(), "Sandbox shipment")]

    def cancel_shipment(self, provider_reference: str, request_key: str) -> str:
        del request_key
        receipt = self.get_shipment(provider_reference)
        self._shipments[provider_reference] = ShipmentReceipt(
            receipt.provider_reference, receipt.tracking_number, "cancelled"
        )
        return "accepted"
