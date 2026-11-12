# Sprint 7 Driver cart and redemption UI

Implemented from the approved Group A Version 2 HTML/CSS and WebP references.
The existing drawer, shared Modal, product images, buttons, tokens, and shell
remain the foundation. View changes move focus to their announcement; the
floating cart button is hidden while the drawer is open. References wrap, and
receipt timestamps use local American dates and a 12-hour clock.

## Implemented flows

- Cart loading, empty, failure, and existing-items views; remove-in-progress,
  unavailable rewards, shortfall, missing costs, free rewards, and View-As.
- A server review request has loading, retryable error, denied, eligible, and
  blocked states. Review and receipt itemization use server data.
- Confirmation generates and saves one UUID before submission. Same-attempt
  retries reuse that key and the original in-memory review token.
- First-submission 409 presents a fresh review for explicit confirmation.
  An uncertain retry's 409 never authorizes a new purchase.
- Receipts retain snapshot names/costs, reference, completion time, and the
  balance after purchase. Closing the drawer retains the receipt in memory;
  Keep shopping dismisses it. Free receipts say no points were deducted.
- Network/server/malformed-success failures preserve the pending attempt.
  Cart mutations are blocked and catalog cards explain the pending state.
- Page refresh restores the owning Driver's key and organization context;
  exact-key lookup and **Cancel unfinished purchase** remain available without
  an in-memory token. A 404 or failed request leaves the attempt pending.
  Cancellation returns a completed receipt or lets the Driver start a new review.
- Storage failure prevents submission, because refresh recovery could not be
  saved. Missing/cleared storage cannot reconstruct an unknown purchase key.

## Verification and remaining manual checks

Focused React/Jest tests cover review and receipt behavior, closing/reopening,
same-key retry, persistence without token storage, lookup outcomes, account
isolation, stale reads, validation, catalog integration, and the shell.

Browser checks against actual authenticated accounts and MySQL are still needed:
both themes at 1440, 1366, 1100, 900, 760, 648, 528, 480, 398, 390, 360, and
320 pixels; long names and references; keyboard focus/return focus; screen-reader
announcements; reduced motion; network interruption; and a real checkout's
balance/history/report updates. No production build or live migration was run.

The Sponsor provider UI is now integrated. Automated provider-to-report checks
are documented in [the commerce closeout](SPRINT7_COMMERCE_CLOSEOUT.md); real
authenticated browser and MySQL checks remain pending.
