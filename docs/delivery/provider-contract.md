# Delivery provider contract

The first Tunisian carrier remains a discovery decision. A provider is acceptable only if it supplies sandbox access, Tunisian coverage, COD semantics, authentication documentation, webhook or polling status, a merchant reference lookup and documented duplicate-request behavior.

Adapter operations:

```text
calculate_price(address, items) -> amount, currency, service, valid_until
create_shipment(order_snapshot, request_key) -> provider_reference, tracking_number
get_shipment(provider_reference) -> normalized shipment
track_shipment(provider_reference) -> ordered normalized events
cancel_shipment(provider_reference, request_key) -> accepted | rejected | pending
```

Shipment creation begins only from `READY_FOR_DELIVERY`. Persist a local submission attempt before calling the carrier. A timeout produces `UNKNOWN`, then reconciliation by merchant/request reference. Never retry creation blindly. Communicate tracking only after a provider acknowledgement is persisted.

Provider events map into monotonic normalized states. A late event cannot regress an order silently. Cancellation after submission stays pending until the carrier resolves it. Pickup consumes reserved inventory; a return restores inventory only after staff record physical inspection.

