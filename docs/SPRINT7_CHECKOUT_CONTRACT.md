# Sprint 7 checkout review and recovery contract

## Review

`POST /api/cart/review/` accepts `{}` and returns the existing cart shape plus
`review_token`. Show the returned items, point costs, total, and balance before
confirmation. The signed token expires after ten minutes and binds the Driver,
Sponsor, conversion rate, balance, cart-row/product identities, names, USD
prices, and listing availability. The client must not modify or construct it.

## Checkout

`POST /api/cart/checkout/` accepts `idempotency_key` (UUID) and `review_token`.
The key remains optional for compatibility, but the new UI must create one at
confirmation and preserve it for recovery. A new checkout requires a valid
review. An already completed key returns its original receipt before token
validation, including when no token is supplied on the retry.

Missing, expired, tampered, or changed reviews return 409:

```json
{"code":"review_changed","detail":"Your cart or pricing changed. Review it again before purchasing.","review":{"results":[],"review_token":"..."}}
```

The actual `review` contains the full current cart response. Present it for
another explicit confirmation. Do not automatically resubmit against a fresh
token. The service locks the Driver, Sponsor conversion rate, cart rows, and
products while validating and recording a purchase.

Successful checkout retains the existing `purchase.items` list of names and
adds/returns `redemption_id`, `reference`, `points_spent`, `point_balance` (balance
after that purchase), `replayed`, `completed_at`, and `line_items`:

```json
[{"name":"Travel Mug","unit_points":1250,"quantity":1}]
```

These item values come from redemption snapshots, not today's catalog. No USD
prices are exposed by the itemized receipt. Quantity is currently always one.

## Recover an exact attempt

`GET /api/cart/redemptions/by-key/<uuid>/` returns `{"purchase": ...}` using the
same receipt shape. It performs no write and is scoped to the effective Driver.
The owner can recover a historical receipt even after losing Sponsor membership.
Other Drivers receive 404. This is not a most-recent-purchase lookup.

A 404 means no completed matching redemption was found at read time. It does
not cancel or conclusively reject an in-flight checkout. Keep an unresolved
attempt recoverable. A POST retry may complete the original purchase and must
use the same key. No cancellation or abandonment endpoint is implemented.

## Errors

Cart validation responses now include `code`. Checkout domain errors use
`cart_empty`, `cart_has_unavailable`, or `insufficient_points`; serializer/input
errors use `invalid_request`. Permission errors retain their existing codes.
Lookup 404 responses use `not_found`. Network/server failures or an unusable
success body remain uncertain outcomes. Never infer their outcome from an
English error message or from a failed later retry.

## Integration status

The old cart frontend does not yet obtain/send a review token. It receives a
409 instead of completing checkout until Group 7 wires this contract. Its
uncertain-failure copy and request-key persistence are also Group 7 work.
No migration is needed for these API changes. SQLite tests cover review drift,
token rejection, replay, snapshot lookup, and ownership. Live MySQL locking
behavior and full browser checkout remain final integration checks. External
provider synchronization is on the separate catalog feature branch; checkout
currently reviews the saved catalog data, not a fresh external-provider request.
