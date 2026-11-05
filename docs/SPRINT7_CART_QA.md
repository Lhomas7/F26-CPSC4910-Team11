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
  only exact-key status lookup is offered without an in-memory token. A 404
  or failed lookup leaves the attempt pending. Other Drivers do not restore it.
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

An unresolved attempt with an expired/lost review and no completed receipt
cannot currently be conclusively cancelled. The UI preserves it and blocks new
purchases. Backend resolution is a separate follow-up, not a fake dismissal.
The Sponsor provider UI remains on the separate catalog branch and must be
integrated before final end-to-end provider/redemption QA.
