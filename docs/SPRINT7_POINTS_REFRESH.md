# Sprint 7 balance and history refresh

Driver Home refreshes standing and recent history after checkout. Points
refreshes standing and full history, preserving its current history limit.
Catalog refreshes balance, pricing, affordability, and cart indicators through
the shared purchase signal. These views and the cart also refresh when the
visible tab regains focus; paired focus/visibility events are coalesced.

The Account page currently displays no point balance. It does not reload its
editable profile form after checkout, preserving unsaved profile changes.
Home, Points, and the cart reset their local state when the effective account,
organization, or View-As session changes. Catalog already keys its view by
effective identity. Older cart reads cannot overwrite a confirmed mutation.

This is event-driven refresh after checkout and on return to the tab. A
continuously visible idle tab does not receive server push updates. The shared
point history continues to display server-provided reasons and local timestamps.
Checkout UI retry behavior and receipt layout are a separate mockup group.

Verification: focused Home, Points, cart, and shared refresh-hook tests use
mocked API data. Real authenticated browser checks against MySQL remain part
of final integration QA.
