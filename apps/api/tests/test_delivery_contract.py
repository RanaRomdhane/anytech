from app.integrations.delivery import (
    DeliveryAddress,
    DeliveryItem,
    SandboxDeliveryProvider,
)


def test_sandbox_carrier_reuses_request_key():
    provider = SandboxDeliveryProvider()
    address = DeliveryAddress("Client", "+21620000000", "1 rue", "Tunis", "Tunis")
    items = [DeliveryItem("SKU-1", "Produit", 1, 25_000)]

    first = provider.create_shipment(address, items, "ORDER-1", "stable-request-key")
    replay = provider.create_shipment(address, items, "ORDER-1", "stable-request-key")

    assert first == replay
    assert provider.calculate_price(address, items).amount_minor == 8_000
