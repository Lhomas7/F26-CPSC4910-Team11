# Personal UI and Engineering Backlog

Personal UI/UX and developer-experience follow-up list for Kylie. This document
tracks refinements that should be completed in small, reviewable groups rather
than folded into one large change. Items that affect interaction patterns
should be mocked or agreed upon before implementation.

## Working Rules

- Keep each group independently committable and testable.
- Prefer shared primitives over page-specific copies.
- Preserve keyboard operation, visible focus, screen-reader labels, and touch
  target sizing.
- Verify full-screen, split-screen, and narrow layouts for every shared control.
- Reuse the current design tokens and light/dark theme colors.
- Do not mix these polish items into unfinished mockup implementations
  unless the mockup directly depends on the shared primitive.

## Recommended Order

1. Complete the remaining html mockup work.
2. Apply the small link and hover-state corrections.
3. Build the shared checkbox primitive and migrate checkboxes separately.
4. Refine the Sponsor MFA requirement control using the checkbox primitive.
5. Extract the shared verification-code input.
6. Mock and implement the collapsible sidebar as its own feature.
7. Audit migrations and define cross-platform development commands separately
   from UI work.
8. Replace the manual offline-demo commands with safe, repeatable management
   commands and environment diagnostics.
9. Add a unified backend-unavailable experience and administrator Sponsor
   Organization management.
10. Define the design-system and mockup contracts before another broad visual
    redesign.
11. Break down the largest frontend pages and complete routing, accessibility,
    and error-boundary work.
12. Decide Python dependency ownership and bring local quality commands into CI.
13. Refine and place decorative assets only after their visual direction and
   reduced-motion behavior are agreed upon.

## Mockup Requirements and Review Process

Future mockups should be implementation specifications, not only attractive
desktop screenshots. Store approved HTML and reference images under a tracked
`docs/assets/ui/<feature>/` directory or record a stable external source link.
Do not treat files in Downloads as the long-term design source.

### Required Viewports

Each page or shared shell change should show at least:

- [ ] Full desktop at a recorded width, preferably `1366px` or wider.
- [ ] Split-screen/tablet near the existing `53.75rem` navigation breakpoint.
- [ ] The known transition widths around `648px`, `528px`, and `398px` when the
      page contains toolbars, filters, or side-by-side actions.
- [ ] Narrow mobile near `390px` and a stress check near `320px`.
- [ ] Both light and dark themes when colors, shadows, borders, illustrations,
      or status treatments change.
- [ ] Browser zoom at `200%` or an equivalent reflow check without horizontal
      scrolling for ordinary content.

Record the exact viewport width beside each reference image. Avoid labels such
as "half screen" that cannot be reproduced on another monitor.

### Required States

Every mockup handoff should explicitly include or declare "not applicable" for:

- [ ] Default populated state.
- [ ] Loading/skeleton state.
- [ ] Empty state with a useful next action.
- [ ] Whole-page failure and independently recoverable partial failure.
- [ ] Offline/backend-unavailable state where it differs from an API error.
- [ ] Forbidden and not-found states.
- [ ] Validation errors, server errors, success feedback, disabled controls,
      and in-progress submission for forms.
- [ ] Long names, usernames, organization names, emails, point reasons, and
      localized date/time strings.
- [ ] Zero, singular, large-count, negative-value, and unusually large-value
      cases where totals or points appear.
- [ ] Keyboard focus, hover, selected, expanded, and destructive-confirmation
      states for interactive controls.
- [ ] Role differences and Administrator view-as mode when the same route has
      different meaning for Driver, Sponsor, and Administrator accounts.

### Required Handoff Notes

- [ ] Identify which existing shared components must be reused rather than
      visually recreating them in page-local HTML.
- [ ] Identify new reusable primitives and their variants.
- [ ] Mark every link, button, menu, dialog, filter, sortable field, and form
      control with its intended behavior.
- [ ] Specify focus order, dialog focus return, accessible labels, live-region
      announcements, and reduced-motion behavior.
- [ ] Specify whether timestamps arrive as ISO values and how they display in
      local American date/time format, including the 12-hour clock and time
      zone assumptions.
- [ ] Distinguish data already supported by an API from data that requires a
      backend contract change.
- [ ] List intentionally omitted mockup-only features so implementation scope
      cannot be inferred from decoration.
- [ ] Include a state inventory and React component mapping, following the
      useful format established by the role-specific Home mockups.
- [ ] Review copy for consistent terminology: `Driver`, `Sponsor`,
      `Administrator`, `Sponsor Organization`, `points`, and `view as`.

### Remaining Mockup Queue

- [ ] Account/Profile for Driver, Sponsor, and Administrator, including view,
      edit, picture upload/removal, password, MFA, login activity, long content,
      success, and failure states.
- [ ] Administrator view-as entry, active-session banner/shell, target switch,
      exit confirmation, expired session, forbidden target, and return to the
      originating Administrator context.
- [ ] Sponsor Organization directory, creation, detail/editing, associated-user
      counts, duplicate-name validation, and archive/deactivate confirmation.
- [ ] Unified backend-unavailable and recovery treatment across public pages,
      authenticated shell pages, and independently loaded dashboard sections.
- [ ] Collapsible sidebar at expanded, collapsed, split-navigation, and narrow
      widths with the Account menu open in each applicable layout.
- [ ] Sign-in, registration, device check, password recovery, and every MFA
      enrollment/challenge/recovery state after shared form controls are agreed.
- [ ] Administrator Users directory and Add/Edit User flows after Sponsor
      Organization creation is introduced.
- [ ] Application-level 403, 404, unexpected-error, session-expired, and
      maintenance states using one coherent family of feedback components.
- [ ] Terms and Privacy at narrow widths and with keyboard-only navigation; the
      content may remain plain, but link and heading behavior must be verified.
- [ ] Component-playground reference states for every new primitive before broad
      migration.

## Sprint 5 UI Mockup Plan

The Sprint 5 release plan centers Kylie's work on Sponsor-scoped catalog
management and Driver reward browsing. The wider team scope also introduces
notification preferences, point-change alerts, phone verification, suspicious
login notices, and additional authentication failure states. Apply the general
mockup requirements above to every Sprint 5 screen.

### Sprint 5 IA and Shared Decisions

- [ ] Decide whether the role-aware route is `/catalog` or `/rewards`; use one
      label consistently in navigation, headings, empty states, tests, and API
      documentation.
- [ ] Add the Catalog navigation destination for Drivers and Sponsors only;
      Administrators should not receive catalog-management UI merely because
      they are Administrators unless a separate story authorizes it.
- [ ] Define how Administrator view-as reaches the Driver and Sponsor Catalog
      while clearly preserving the active view-as banner and exit action.
- [ ] Reuse the existing application shell, top bar, page-header behavior,
      Account menu, card language, status badges, buttons, skeletons, and state
      panels.
- [ ] Define one responsive Catalog card primitive with deliberate Driver and
      Sponsor variants rather than two unrelated card designs.
- [ ] Decide the source and storage model for product images before mockups imply
      upload, cropping, external URLs, or an image-provider integration that the
      Sprint does not support.
- [ ] Decide whether descriptions appear on cards, in an expanded region, or on
      a future Product Detail page. Do not invent Product Detail or redemption
      workflows for Sprint 5 unless they become stories.
- [ ] Define point-cost formatting, affordability language, availability
      language, and precedence when a product is both unavailable and
      unaffordable.
- [ ] Keep Sponsor ownership invisible as a security implementation detail to a
      Driver, while still identifying the Driver's Sponsor Organization in the
      page context.
- [ ] Keep all creation/update confirmations accessible and persistent enough to
      be read without forcing a page reload.

### S5-UI-001: Sponsor Catalog Management

Supports stories `24300`, `24316`, and `24893`, plus tasks `27489` through
`27494`.

- [ ] Mock the populated Sponsor Catalog page with page heading, organization
      context, product count, Add Product action, and responsive product list or
      grid.
- [ ] Show product image/fallback, name, point cost, availability, and only the
      management actions authorized by Sprint 5.
- [ ] Make availability an explicit labeled control with `Available`,
      `Unavailable`, saving, saved, and failed states; do not communicate it by
      color alone.
- [ ] Decide whether Add Product is a routed page or modal based on form length,
      mobile usability, refresh/deep-link needs, and error recovery.
- [ ] Mock the Add Product form with the final model/API fields only. Expected
      candidates include name, description, point cost, image source, and
      initial availability, but the backend contract is authoritative.
- [ ] Include field guidance, required markers, character/number constraints,
      image preview or fallback behavior where supported, Cancel, and a clear
      primary submit action.
- [ ] Include client validation, server validation, duplicate/ownership error,
      image failure, submitting, success, and retry states.
- [ ] Include an empty Catalog state that points to Add Product without making
      the page look broken.
- [ ] Include whole-page loading/failure and one-card availability-update
      failure without disabling unrelated cards.
- [ ] Include long product names/descriptions, missing or broken images, zero
      cost if allowed, large point costs, and many products.
- [ ] Define keyboard focus and screen-reader feedback for an availability
      change that updates in place.
- [ ] Verify full desktop, split, `648px`/`528px` transitions, and narrow card
      layouts without hiding the Add Product action.
- [ ] Confirm one Sponsor cannot see or modify another Sponsor Organization's
      products; represent forbidden/not-found results without revealing whether
      another organization's product exists.

Do not include editing arbitrary product details, deleting products, inventory
quantities, redemption, cart, checkout, or orders unless the Sprint 5 backlog is
expanded to cover them.

### S5-UI-002: Driver Catalog and Reward Cards

Supports stories `24774`, `24775`, `24777`, `24778`, `24779`, and `26206`, plus
tasks `27497` through `27518`.

- [ ] Mock a populated Driver Catalog page scoped to the signed-in Driver's
      Sponsor Organization.
- [ ] Show the Driver's current point balance prominently enough to interpret
      affordability without competing with the product grid.
- [ ] Show each reward's image/fallback, name as the card heading, formatted
      point cost, and explicit availability/affordability state.
- [ ] Distinguish at least four combinations: available and affordable,
      available but unaffordable, unavailable but otherwise affordable, and both
      unavailable and unaffordable.
- [ ] Gray or mute unaffordable products without reducing text contrast below
      accessibility requirements or making them indistinguishable from disabled
      unavailable products.
- [ ] Add concise explanatory text such as points still needed where useful;
      never rely only on opacity or color.
- [ ] Keep unavailable and unaffordable reasons separate and deterministic when
      both apply.
- [ ] Do not show a Redeem/Buy action unless redemption is added to Sprint 5.
      If the visual needs a future-action location, label it explicitly as out
      of scope rather than rendering a misleading disabled control.
- [ ] Include loading skeletons that match the final card geometry, whole-page
      failure with Retry, empty Sponsor Catalog, and Driver-without-Sponsor
      guidance.
- [ ] Include a Sponsor-assignment failure/unknown state distinct from a truly
      unassigned Driver.
- [ ] Include broken/missing images with useful alternative text or decorative
      fallback semantics based on whether the image adds information.
- [ ] Include long names, large costs, exactly-enough-points affordability, one
      point short, zero balance, and zero-cost behavior if zero is valid.
- [ ] Define card reading/focus order and ensure a noninteractive card does not
      falsely look clickable.
- [ ] Verify grid behavior from wide desktop through one-column narrow mobile,
      including `200%` zoom.

### S5-UI-003: Catalog Shared Components and Playground States

- [ ] Add the Driver and Sponsor Catalog card variants to the component
      playground before duplicating markup across pages.
- [ ] Add image loading, image fallback, long-name, available, unavailable,
      affordable, unaffordable, saving, and update-error examples.
- [ ] Add a point-cost formatter and status-badge treatment consistent with
      Point History and the existing semantic status colors.
- [ ] Add Catalog grid/container examples at representative responsive widths.
- [ ] Document which pieces are shared and which are deliberately role-specific.
- [ ] Add component tests for headings, alternative text, status text, disabled
      behavior, exact affordability boundary, and long-content rendering.

### S5-UI-004: Driver Notification Preferences

Supports team stories `24735`, `24740` through `24743`, `26214`, `26216`, and
`26217`, plus tasks `27468` through `27475`.

- [ ] Mock one Notification Preferences section on Account rather than scattered
      settings on Points, Home, or individual alert cards.
- [ ] Show separate added-points and removed-points preferences, their defaults,
      and enabled delivery methods supported by the backend.
- [ ] Define interaction with email, SMS, and in-app delivery when a contact
      method is missing, unverified, unavailable, or disabled.
- [ ] Reuse the planned shared checkbox/switch convention and stable status
      layout.
- [ ] Include loading, saving, saved, rollback-on-failure, partial failure, and
      no-supported-delivery-method states.
- [ ] Mock representative point-change notifications containing signed amount,
      reason, resulting balance, Sponsor Organization, and local timestamp.
- [ ] Define unread/read treatment and the destination when an alert is opened;
      do not imply a notification center route unless one is in scope.
- [ ] Confirm preferences persist across sign-out/sign-in and are scoped to the
      Driver account, not the current browser.

### S5-UI-005: Phone Verification and Suspicious-Login Feedback

Supports team stories `24709` and `24712` and tasks `27462` and `27466`.

- [ ] Mock adding/changing a phone number, requesting a verification code,
      entering the code, resending with cooldown, success, invalid/expired code,
      delivery failure, and cancellation.
- [ ] Reuse the shared verification-code component if its interaction fits SMS.
- [ ] Clearly distinguish a saved phone number from a verified phone number.
- [ ] Prevent the UI from claiming SMS alerts are active until verification and
      provider availability requirements are satisfied.
- [ ] Mock the in-app suspicious-login notice for Drivers and the email/SMS copy
      contract without exposing IP address or device fingerprint data the app
      does not collect.
- [ ] Define dismissal/read behavior and the security action offered to a user
      who does not recognize the activity.
- [ ] Include masked phone display, keyboard/mobile input, country code,
      validation, rate limiting, and accessibility states.

### S5-UI-006: Authentication Security States

Supports rate limiting, reset-link invalidation, reset-session invalidation,
anti-enumeration, password validation, and secure Administrator reset stories.

- [ ] Mock a generic password-reset request confirmation that does not disclose
      whether an account exists.
- [ ] Mock used, expired, malformed, and otherwise invalid reset links with a
      safe path to request another link.
- [ ] Define what the current browser shows after a password reset invalidates
      other sessions and what another invalidated session sees on its next
      request.
- [ ] Mock login throttling/rate-limit feedback without revealing sensitive
      thresholds or allowing the submit layout to jump.
- [ ] Show every unmet password requirement together where the story requires
      it, using the server-provided password policy.
- [ ] Mock the Administrator reset workflow separately if it requires stronger
      reauthentication, confirmation, audit explanation, or forced sign-out.
- [ ] Verify that security messages remain specific enough to act on while not
      enabling account enumeration.

### Sprint 5 Work That Does Not Need New Page Mockups

The following work should receive tests, operational documentation, and failure
handling but should not generate decorative UI solely to prove completion:

- [ ] Sponsor authorization and catalog isolation in services/APIs.
- [ ] Password hashing, salting, and sensitive-data-at-rest controls.
- [ ] HTTPS, domain, certificate, secret scanning, Secrets Manager, and deployment
      security configuration.
- [ ] Server-side password validation and reset-token/session invalidation logic.
- [ ] Catalog migrations, indexes, constraints, and normalized input rules.

Only add user-facing UI for these when the user must make a choice, understand a
recoverable failure, or complete an authorized workflow.

### Sprint 5 Mockup Delivery Order

1. [ ] Confirm Catalog terminology, route, data fields, image strategy, and
       out-of-scope actions with the team.
2. [ ] Mock the shared product card and status combinations.
3. [ ] Mock Sponsor Catalog management and Add Product states.
4. [ ] Mock Driver Catalog populated, boundary, empty, unassigned, and failure
       states.
5. [ ] Review the Catalog set against stories `24300`, `24316`, `24774`,
       `24775`, `24777`, `24778`, `24779`, `24893`, and `26206` before coding.
6. [ ] Mock Notification Preferences and representative point alerts with the
       teammate who owns those stories.
7. [ ] Mock phone verification, suspicious-login feedback, and authentication
       security states only after confirming the owning teammate's backend
       contracts.
8. [ ] Export approved desktop, split, and narrow references plus the HTML/state
       controls and store them in the agreed versioned design location.

## Small Link and Hover Corrections

### UI-001: Point History Driver Links

- [ ] Remove the permanent underline from Driver names in Sponsor Point History.
- [ ] Show the underline only on hover or keyboard focus.
- [ ] Preserve the normal link cursor, focus indicator, and accessible name.
- [ ] Confirm the shared `PointHistoryList` produces the same link treatment on
      Home, Points, and other mixed-Driver activity lists.
- [ ] Do not change ordinary reason text or signed point badges.

Likely shared area:
`frontend/src/features/points/components/PointHistoryList.jsx` and
`frontend/src/features/points/Points.css`.

### UI-002: Pending Driver Hover Color

- [ ] On the Sponsor Drivers directory, keep approved Driver-name hover states
      green.
- [ ] Change pending Driver-name hover and focus states to the warning/yellow
      color.
- [ ] Ensure the card border/focus treatment and name color communicate the same
      pending state.
- [ ] Verify the change in light and dark themes.

Likely area: `frontend/src/features/drivers/Drivers.css`.

### UI-003: Text-Link Typography Audit

- [ ] Inventory green text links across Home, Points, Drivers, Users, About,
      Account, authentication, and legal pages.
- [ ] Identify the existing link whose weight and hover behavior look correct
      and use it as the comparison target.
- [ ] Decide whether the default in-content link should use medium or regular
      weight instead of `700` or `800`.
- [ ] Define distinct treatments for body links, card-heading actions, and
      button-like navigation.
- [ ] Avoid globally weakening navigation labels, buttons, or links that require
      strong emphasis.
- [ ] Confirm hover, focus-visible, visited, and dark-theme behavior.

This should result in one documented shared link convention rather than a set of
page-specific overrides.

## Shared Form Controls

### UI-004: Shared Checkbox Primitive

- [ ] Design a larger custom checkbox that replaces the browser-default square.
- [ ] Keep the real checkbox input in the accessibility tree.
- [ ] Support checked, unchecked, disabled, invalid, focus-visible, and busy
      states.
- [ ] Provide at least a 2.25rem interactive target even when the visible mark is
      smaller.
- [ ] Allow labels and optional helper/error text to wrap without misaligning the
      control.
- [ ] Ensure the check mark remains legible in light and dark themes.
- [ ] Add reusable component tests before migrating every screen.

Current checkbox consumers to review:

- Account creation Terms of Service and Privacy Notice agreement:
  `frontend/src/features/authentication/pages/LoginPage.jsx`
- Sponsor Driver MFA requirement:
  `frontend/src/features/sponsors/components/DriverMfaRequirement.jsx`
- Administrator registration-verification setting:
  `frontend/src/features/admin-users/components/RegistrationSettingsPanel.jsx`
- Component playground example:
  `frontend/src/features/playground/pages/PlaygroundPage.jsx`

Suggested component location:
`frontend/src/components/forms/CheckboxField.jsx` with a colocated stylesheet and
tests.

Do not migrate all consumers in the same commit as the primitive unless the
diff remains small. Prefer one foundation commit followed by focused migration
commits.

### UI-005: Stable MFA Requirement Control

- [ ] Rework the Sponsor setting that controls whether Driver MFA is required.
- [ ] Reuse the shared checkbox primitive rather than creating another custom
      input.
- [ ] Display `Required` and `Not required` inside stable status badges.
- [ ] Reserve enough space for either badge so the surrounding layout does not
      shift when the value changes.
- [ ] Keep the label, description, checkbox, status badge, saving state, and
      error message aligned at full, split, and narrow widths.
- [ ] Preserve optimistic-update rollback when the request fails.
- [ ] Review the Administrator registration-verification setting for the same
      layout pattern.

Primary consumer:
`frontend/src/features/sponsors/components/DriverMfaRequirement.jsx`.

This control should be mocked or approved before implementation because it
changes both the checkbox and status presentation.

### UI-006: Shared Verification Code Input

- [ ] Extract the six-digit MFA code experience from Sign in into a reusable
      component.
- [ ] Use it for Sponsor and Administrator MFA setup and verification.
- [ ] Support digit-by-digit entry, whole-code paste, Backspace navigation,
      arrow-key navigation, and mobile one-time-code autofill.
- [ ] Preserve `inputmode="numeric"`, appropriate autocomplete behavior, and a
      single accessible group label.
- [ ] Expose the combined code value to forms rather than making callers join
      DOM input values.
- [ ] Support disabled, invalid, busy, cleared, and auto-focus states.
- [ ] Ensure validation errors do not move or resize the six boxes unpredictably.
- [ ] Add component-level keyboard, paste, validation, and accessibility tests.

Current implementations to reconcile:

- Six-box sign-in MFA input:
  `frontend/src/features/authentication/pages/LoginPage.jsx`
- Single-field Account MFA setup and verification:
  `frontend/src/features/accounts/components/MfaPanel.jsx`
- Registration email-verification input should be evaluated separately; do not
  automatically change it unless the same interaction is appropriate.

Suggested component location:
`frontend/src/components/forms/VerificationCodeInput.jsx` with a colocated
stylesheet and tests.

## Navigation

### UI-007: Collapsible Sidebar

- [ ] Mock a desktop sidebar toggle inspired by ChatGPT without copying product
      branding or relying on an unlabeled icon.
- [ ] Define expanded, collapsed, hover, focus, active-route, and keyboard states.
- [ ] Decide whether the collapsed state shows icons with tooltips or a temporary
      flyout.
- [ ] Preserve access to the profile menu in both states.
- [ ] Decide whether the user preference persists in local storage.
- [ ] Define behavior at the existing `53.75rem` top-navigation breakpoint.
- [ ] Avoid adding a redundant toggle when the sidebar has already transformed
      into the compact top navigation.
- [ ] Ensure content width and the app top bar respond without visual jumping.
- [ ] Add shell/navigation tests for both states.

Reference status: the mentioned screenshots folder was not found in the
repository or under `C:\Users\missk\CPSC 4910` during this audit. Add the
reference images under a tracked documentation-assets folder or provide their
exact path before mockup work begins.

Suggested future reference location:
`docs/assets/ui/sidebar-toggle/`.

Likely implementation areas:

- `frontend/src/app/AppLayout.jsx`
- `frontend/src/app/AppLayout.css`
- `frontend/src/app/navigation.js`
- `frontend/src/components/primitives/Icons.jsx`

## Visual Assets and Motion

### UI-008: Reuse the Shared Road Asset

- [ ] Inventory every page that draws a road or road-like strip with custom CSS.
- [ ] Compare those implementations with the existing shared `Road` scenery
      asset and `RoadTruck` branding component.
- [ ] Replace duplicate road drawings with the shared asset where its semantics
      and dimensions fit; extend the asset through explicit variants when they
      do not.
- [ ] Decide whether the road itself remains visually constant between themes or
      uses distinct light- and dark-theme surfaces.
- [ ] Keep lane markings and vehicles sufficiently contrasted in both themes.
- [ ] Avoid turning a decorative road into a screen-reader landmark.

Existing areas to compare include About, Welcome/Home, and authentication, plus
`frontend/src/components/assets/scenery/Road.jsx` and
`frontend/src/components/branding/RoadTruck.jsx`.

### UI-009: Refine the Semi-Truck Asset

- [x] Increase the semi-truck's visual detail without making it illegible at its
      smallest supported size.
- [x] Fix the misaligned exhaust pipe.
- [x] Verify both facing directions, motion states, crash states, and rescue
      animation placement after the drawing changes.
- [x] Check that detail does not disappear or become noisy in light and dark
      themes.
- [x] Update asset snapshots/component tests as appropriate.

Primary area: `frontend/src/components/assets/vehicles/SemiTruck.jsx` and its
colocated stylesheet.

Verified in a production build at `1×` to `4×`, facing both directions, on
light and dark backgrounds, and through the playground road-truck scene (drive,
crash, wreck, fire spread, and fire-truck rescue from the far side) in both
color schemes. The overall `2.875em × 1.125em` box is unchanged, so RoadTruck's
lane, effect, and rescue geometry did not need adjusting.

### UI-010: Correct Bus Door Placement

- [x] Review School, City, and Double-Decker bus door placement at normal and
      enlarged playground scales.
- [x] Move doors to physically plausible positions without overlapping windows,
      wheels, trim, or destination signage.
- [x] Verify left- and right-facing rendering and all existing animation states.
- [x] Update asset tests if structure or class names change.

Primary area: `frontend/src/components/assets/vehicles/Buses.jsx` and its
colocated stylesheet.

- School bus: the door stays just behind the front wheel and gains a frame; the
  folded STOP-arm hinge moved forward so it no longer overlaps the door, and the
  extended arm sits on the rub rails clear of the door.
- City bus: the front door was already between the last window and the
  windshield, ahead of the front wheel; it gains a frame.
- Double-decker: the door ran down into the front wheel. The front axle moved
  back and the door now sits between it and the driver's cab, as on modern
  London buses.

No class names or element structure changed, so the existing asset tests still
apply. Open: the STOP arm is shown on the visible (curb) side for readability,
although real arms are on the driver side; see Deferred Questions.

NOTE: might come back to later for more tweaks

### UI-011: Refine the Remaining Vehicle Assets

Bring the other vehicles up to the semi truck's level of detail and fix
inconsistencies, one vehicle per commit.

- [ ] Give every vehicle the same wheel treatment (silver hub, spoke only while
      moving) so the semi truck no longer differs from the rest.
- [ ] Car, Taxi, and Police car: door seams, side mirror, bumper, wheel arches,
      and a clearer roof sign (taxi) and light-bar mount (police).
- [ ] Police car: decide whether to add `POLICE` lettering or a badge shape that
      stays legible at `1×`; avoid text that becomes noise when small.
- [ ] Ambulance: rear doors, side door, light-bar mount, and a reflective stripe
      that stays visible on light backgrounds.
- [ ] Fire truck: hose reel or compartment doors, rear step, and a pump panel;
      confirm the water spray still lines up with the RoadTruck rescue.
- [ ] Buses: wheel arches, mirrors, and rear details; decide whether the City
      bus needs a rear exit door that interrupts the window row.
- [ ] Check every vehicle at `1×`, `2×`, and `4×`, facing both directions, with
      `moving`, `speeding`, lights on/off, and both `crash` poses.
- [ ] Check light-colored bodies (police, ambulance, city bus, trailer) against
      light backgrounds; add a faint outline where they disappear.
- [ ] Keep each vehicle's overall box size unless every consumer (RoadTruck,
      playground scenes) is re-verified.
- [ ] Extend the asset tests to cover any new parts.

Primary area: `frontend/src/components/assets/vehicles/`.

### UI-012: Refine Scenery and Street Assets

- [ ] Audit buildings, gas station, school, signs, street furniture, plants,
      traffic light, road, and sky assets at `1×` through `4×`.
- [ ] Sign lettering (`STOP`, `SPEED LIMIT`, `SCHOOL`) is only readable at about
      `2×` and above; decide a minimum supported size or swap text for shapes
      below it.
- [ ] Align every asset to a common ground line so mixed street scenes do not
      need per-asset offsets.
- [ ] Give every lit-capable asset a consistent night treatment (`lit`) and
      check it in dark theme.
- [ ] Add missing detail where shapes read as placeholders (building trim,
      doors, roof equipment, pump hoses, bench slats, hydrant caps).
- [ ] Verify the school flag, cloud drift, sun rotation, and beacon blinking all
      stop under `prefers-reduced-motion`.
- [ ] Update the playground street and school-zone scenes after changes.

Primary area: `frontend/src/components/assets/scenery/`.

### UI-013: Refine People, Animal, and Effect Assets

- [ ] Review Person proportions, arm and leg pivots, and walking cadence at
      playground scales; fix any limbs that detach while walking.
- [ ] Add a small set of variations (hair styles, a hat, a backpack for
      children) without turning the component into a character builder.
- [ ] Review the Dog at small sizes; consider one or two coat patterns.
- [ ] Check skin-tone and clothing color defaults for contrast against light and
      dark backgrounds.
- [ ] Review Collision, Impact, Fire, Flame, and Smoke for consistent palette,
      timing, and reduced-motion static states.
- [ ] Confirm every effect stays decorative (`aria-hidden`) and never carries
      information that is not also shown in text.

Primary area: `frontend/src/components/assets/people/` and
`frontend/src/components/assets/effects/`.

### UI-014: Commerce and Shopping Assets

New decorative assets for the upcoming Catalog, Cart, and Orders pages (see the
Sprint 5 Catalog items above). Build them in the playground first; place them
on pages only through the asset placement audit (UI-015).

- [ ] Store fronts as `Building`-style variants or a `Store` asset with
      variants: grocery, electronics, sporting/outdoor goods, gift or
      department store, coffee/restaurant, and a truck stop/travel center that
      fits the trucking theme.
- [ ] Shopping cart: empty, partly full, and full states; a rolling animation
      with spinning wheels; reduced-motion static state.
- [ ] Shopping basket and shopping bags for small-order and checkout states.
- [ ] Product packaging: a generic boxed product, a gift box, a gift card, and a
      price tag that can show a point cost.
- [ ] Order-status illustrations: packed box, box on a delivery truck, box at a
      door (delivered), and a cancelled/returned treatment.
- [ ] A delivery van or box truck that matches the existing vehicle family and
      supports `moving`, `facing`, and `crash`.
- [ ] A points token/coin that pairs with the existing point formatting, for
      empty states and success moments.
- [ ] Matching navigation icons for Catalog, Cart, and Orders in
      `components/primitives/Icons.jsx`, consistent with the existing icon set.
- [ ] Empty-cart, empty-catalog, order-placed, and no-orders playground
      examples, so placements can be reviewed before page work starts.
- [ ] Keep every commerce asset decorative: never imply a Buy, Redeem, or
      checkout action that the page does not actually support.
- [ ] Add asset tests and playground cards for every new asset.

Primary area: new files under `frontend/src/components/assets/` (for example
a `commerce/` folder) plus `features/playground/`.

### UI-015: Asset and Animation Placement Audit

- [ ] Inventory existing vehicles, scenery, weather, effects, and icons before
      designing anything new.
- [ ] Identify empty, loading, success, onboarding, and status states where an
      existing asset adds meaning or personality.
- [ ] Keep operational screens readable; assets must not obscure controls or
      become required to understand state.
- [ ] Define a consistent scale, placement, and animation-density convention.
- [ ] Respect `prefers-reduced-motion` and provide a useful static state.
- [ ] Mock and review candidate placements before rolling them out broadly.
- [ ] Add placements in small page- or feature-specific commits.

Use the component playground as the asset catalog and visual test surface.

## Database and Developer Experience

These are engineering tasks, not UI polish. Keep them in separate branches and
commits from the visual work above.

### DX-001: Audit and Stabilize the Django Migration Graph

- [ ] Capture the current migration graph with `showmigrations` and `migrate
      --plan` against a fresh local database and the shared development schema.
- [ ] Confirm `makemigrations --check --dry-run` produces no uncommitted model
      changes.
- [ ] Document why `accounts` contains two `0004` branch migrations and the
      subsequent `0005` merge migration.
- [ ] Check for duplicate operations, obsolete temporary models, unsafe data
      migrations, and dependencies that produce different fresh-install and
      upgrade paths.
- [ ] Do not renumber, delete, or rewrite migrations already recorded in a shared
      database merely to make filenames sequential.
- [ ] If cleanup requires squashing, write and test a coordinated migration plan
      for existing databases and fresh installs before changing history.
- [ ] Add a CI check that rejects missing migrations and verifies the migration
      plan on a clean test database.
- [ ] Record a repeatable recovery procedure for local databases whose migration
      history is inconsistent.

Known graph detail: `accounts/0004_adminimpersonationevent.py` and
`accounts/0004_mfabackupcode.py` are parallel branches joined by
`accounts/0005_merge_admin_impersonation_mfa_backup.py`. Duplicate sequence
numbers alone do not mean the Django graph is invalid.

### DX-002: Universal Local Startup Command

- [ ] Choose one cross-platform task entry point configured through
      `pyproject.toml`.
- [ ] Make the command run Django system checks, show or apply the intended
      migrations, and start the backend development server in a predictable
      order.
- [ ] Decide whether frontend startup is coordinated by the same entry point or
      remains a second explicitly documented process.
- [ ] Fail immediately when prerequisites, environment variables, database
      connectivity, checks, or migrations fail.
- [ ] Support Windows PowerShell and macOS shells without maintaining different
      command names.
- [ ] Keep the underlying steps independently runnable for troubleshooting and
      CI.
- [ ] Update both repository READMEs and local-development documentation after
      the command is stable.

Constraint: `pyproject.toml` can configure a task runner or Python entry point,
but a child process cannot activate a virtual environment in its parent shell.
The final workflow should either use the environment's Python directly or make
environment activation/bootstrap a clearly documented prerequisite.

### DX-003: Universal Local Setup Command

- [ ] Define a cross-platform setup/bootstrap command through the selected
      `pyproject.toml` tool or entry point.
- [ ] Cover virtual-environment creation or detection, Python dependency
      installation, frontend dependency installation, `.env` setup guidance,
      Django checks, and initial migrations.
- [ ] Never generate, copy, print, or commit real secrets.
- [ ] Make repeated runs safe and idempotent.
- [ ] State supported Python and Node versions and validate them early.
- [ ] Test from a clean clone on both Windows and macOS.
- [ ] Keep production deployment commands separate from local bootstrap.

### DX-004: Finalize Linting and Formatting Policy

- [ ] Inventory the current Python and frontend linting/formatting commands and
      identify overlaps or contradictions.
- [ ] Preserve the existing Ruff rules and single-quote/100-column decisions
      until an alternative is deliberately approved.
- [ ] Evaluate `mellow-fmt` in a throwaway branch or representative file set;
      do not run it across the repository first.
- [ ] Before adoption, verify supported languages, Windows/macOS behavior,
      configuration options, check-only mode, editor integration, maintenance
      status, license, and CI suitability.
- [ ] Compare its output and diff churn against Ruff formatting for Python and
      the existing frontend tools.
- [ ] Decide on one authoritative formatter per language and document which
      tool owns imports, formatting, linting, and CSS.
- [ ] Add non-mutating CI checks and matching local commands.
- [ ] Apply any repository-wide reformat as an isolated mechanical commit.

Current Python policy lives in the root `pyproject.toml` under `[tool.ruff]`.
`mellow-fmt` remains an evaluation candidate, not an adopted dependency.

## Offline Development and Demo Readiness

The October 2026 RDS outage proved that the application can run successfully
against SQLite, but it also exposed several manual and error-prone steps. The
current recovery procedure is documented in
`docs/LOCAL_OFFLINE_DEVELOPMENT.md`; the items below should replace those shell
snippets with supported project workflows.

### DX-005: Deterministic Demo-Data Management Command

- [ ] Add an idempotent Django management command such as `seed_demo_data`.
- [ ] Create a coherent demonstration organization, Sponsor, approved Driver,
      pending Driver, unlinked Driver, and Administrator without requiring raw
      SQL or long `manage.py shell -c` commands.
- [ ] Include representative point transactions, reasons, timestamps,
      notifications, and status history so Home, Drivers, Driver Detail, and
      Points all have meaningful populated states.
- [ ] Offer named datasets or options for populated, empty, pending-only,
      partial, and mixed-status demonstrations where practical.
- [ ] Make repeated runs deterministic and safe: update owned demo records,
      avoid duplicate ledger entries, and never modify unrelated user data.
- [ ] Require an explicit local/demo-environment guard before creating known
      credentials or resetting data.
- [ ] Do not embed a shared or production password in source control. Accept a
      local password interactively, generate a disposable one, or read an
      explicitly local environment value without printing secrets by default.
- [ ] Add a separate explicit reset option that identifies exactly which demo
      records it will remove and requires confirmation.
- [ ] Add backend tests for first run, repeated run, partial preexisting data,
      and refusal to run in a protected environment.
- [ ] Update `docs/LOCAL_OFFLINE_DEVELOPMENT.md` to use the supported command
      after it exists.

This should implement the deterministic demo-data requirement already tracked
in `PROJECT_TODO.md`, not create a second competing fixture system.

### DX-006: Repair the About-Release Seed Workflow

- [ ] Audit `seed_about_page`; it currently represents older Sprint content and
      is not the authoritative source for the latest release shown by a fresh
      database.
- [ ] Decide whether releases are supplied by a versioned fixture, a migration,
      a management command with arguments, or release metadata generated by the
      release workflow.
- [ ] Ensure a clean migration and an upgraded database produce the same set of
      intended release records.
- [ ] Make release creation idempotent by using a stable key and deliberate
      update rules.
- [ ] Validate version, Team number, release date, product name, and description
      rather than requiring developers to paste a Python one-liner.
- [ ] Prevent a local demonstration seed from silently rewriting historical
      release records in shared environments.
- [ ] Add command/migration tests and document the one authoritative procedure.
- [ ] Correct README claims and setup commands after the workflow is finalized.

### DX-007: Environment Doctor and Explicit Database Selection

- [ ] Add a non-destructive command such as `manage.py doctor` that reports the
      selected database engine, database target without its password, Debug
      state, frontend origin, email/SMS delivery mode, migration state, and API
      health prerequisites.
- [ ] Clearly label SQLite as isolated/local and MySQL as shared before commands
      that can mutate data.
- [ ] Detect and explain shell variables that override `backend/.env`, since a
      fresh PowerShell terminal and an existing server process can otherwise
      select different databases.
- [ ] Fail with a concise actionable message when `TOTP_ENCRYPTION_KEY` or
      another required value is missing.
- [ ] Warn when console email/SMS delivery is not active during local MFA tests.
- [ ] Add a safe connectivity check that does not run migrations or write data.
- [ ] Integrate the diagnostic into the future universal setup/start commands
      rather than maintaining unrelated scripts.
- [ ] Test output with secrets redacted on Windows, macOS, SQLite, and MySQL.

### DX-008: SQLite and MySQL Compatibility Verification

- [ ] Define which automated tests run against SQLite and which must also run
      against MySQL.
- [ ] Add CI coverage for migrations and critical account, Driver, Sponsor, and
      points workflows on the same engine used by the deployed application.
- [ ] Check constraints, indexes, date/time behavior, case-insensitive
      uniqueness, ordering, and transaction behavior for engine differences.
- [ ] Verify that a fresh database and an upgraded database both reach the same
      expected schema and baseline data.
- [ ] Document features that are intentionally unavailable or behave
      differently under SQLite.
- [ ] Keep local SQLite convenient without allowing it to become the only
      pre-merge database signal.

### DX-009: Local Data Lifecycle and Backup Safety

- [ ] Provide a supported way to archive, name, inspect, and restore disposable
      local SQLite databases without overwriting another backup.
- [ ] Prefer timestamped backup names and detect collisions before moving a
      database file.
- [ ] Explain when an old local database can be migrated and when a clean reset
      is appropriate.
- [ ] Confirm all SQLite databases, local media, generated codes, and demo
      artifacts remain ignored by Git.
- [ ] Add a pre-commit or CI guard against accidentally tracked database files
      and populated environment files.
- [ ] Keep destructive reset behavior separate from ordinary startup and require
      an explicit target and confirmation.

## Offline and Administrative UI Follow-ups

### UI-016: Unified Backend-Unavailable Experience

- [ ] Detect loss of API connectivity separately from an authenticated request
      returning a normal validation, permission, or not-found response.
- [ ] Present one calm app-level status treatment when the backend is offline
      instead of allowing every dashboard card to repeat the same connection
      error.
- [ ] Keep independently retryable section errors when only one endpoint fails.
- [ ] Provide a clear Retry action and restore content automatically or with a
      predictable confirmation when the backend returns.
- [ ] Do not expose hostnames, credentials, stack traces, or raw server errors.
- [ ] Preserve navigation to static/public content that can still function,
      including Terms, Privacy, and any deliberately cached content.
- [ ] Decide whether authenticated pages retain their last safe display, show a
      skeleton, or replace sensitive content while connectivity is unknown.
- [ ] Test initial outage, mid-session outage, recovery, expired session,
      partial endpoint failure, and narrow-screen layouts.
- [ ] Ensure screen readers receive one meaningful status announcement rather
      than repeated live-region noise.

This is an error-state improvement, not permission to ship a fake production
backend or silently fall back from RDS to browser data.

### UI-017: Sponsor Organization Administration

- [ ] Add the already-planned Administrator Sponsor Organization directory so
      local and shared setup no longer requires a Django shell command.
- [ ] Provide organization creation, detail, editing, active/inactive state, and
      safe archival behavior consistent with `PROJECT_TODO.md`.
- [ ] Show counts of associated Sponsor accounts and Drivers before allowing a
      state-changing action.
- [ ] Prevent or clearly resolve case-insensitive duplicate organization names.
- [ ] Define the empty state shown before the first organization exists, with an
      obvious Create Organization action.
- [ ] Integrate organization selection into Add User and account-edit flows
      without requiring a page refresh after a new organization is created.
- [ ] Handle loading, empty, validation, duplicate, forbidden, API-failure, and
      narrow-screen states.
- [ ] Add accessible confirmation and success feedback for administrative
      changes.
- [ ] Back the UI with audited, role-protected APIs; do not expose direct model
      mutation merely for demo convenience.

### UI-018: Demo-State and Role Smoke-Test Matrix

- [ ] Maintain a compact matrix of the data and UI states required for each
      role before a sprint demonstration.
- [ ] Cover Administrator normal and view-as modes; Sponsor populated, pending,
      empty, and failure states; and Driver approved, pending, unlinked, and
      point-history states.
- [ ] Include About release correctness, MFA/device-check behavior, and sign-out
      between roles.
- [ ] Map each state to either deterministic seeded data or a documented action
      that creates it.
- [ ] Add automated frontend coverage for states that should not depend on a
      live database.
- [ ] Keep credentials and environment-specific identifiers out of screenshots,
      fixtures, and committed test output.
- [ ] Use separate browser profiles or isolated sessions when simultaneous role
      comparison is required.

## Frontend Architecture and Quality

### UI-019: Not-Found, Error-Boundary, and Route-State Design

- [ ] Add an explicit catch-all route; unknown client-side URLs currently have
      no dedicated application 404 experience.
- [ ] Standardize 403, 404, session-expired, maintenance, network-outage, and
      unexpected-render-error treatments without making them indistinguishable.
- [ ] Add an application error boundary that protects the shell from an
      uncaught component error and offers a safe recovery path.
- [ ] Decide which errors retain navigation and which require a minimal isolated
      page, especially during authentication and Administrator view-as.
- [ ] Preserve the intended return location through sign-in only when that route
      remains authorized for the resulting account.
- [ ] Add route tests for direct navigation, refresh, unknown IDs, unauthorized
      roles, stale view-as sessions, and unknown paths.
- [ ] Mock the full feedback-state family before implementing page-specific
      one-offs.

### UI-020: Decompose Oversized Pages and Feature Styles

- [ ] Split `LoginPage.jsx` by authentication stage: sign-in, MFA method/code,
      registration role/details, and email verification.
- [ ] Split `MfaPanel.jsx` into method status, enrollment, challenge,
      backup-code, and disable/reset components around one orchestration layer.
- [ ] Extract Account profile view/edit, picture, password, MFA, and login
      activity sections so each has focused tests and request ownership.
- [ ] Reconcile the three Administrator account-detail pages around shared
      identity, status, organization, avatar, and action sections without hiding
      real role differences behind excessive conditionals.
- [ ] Break `Drivers.css` and other large feature styles into page/component
      ownership or documented layers; do not merely split files by line count.
- [ ] Keep data orchestration near pages and visual components free of direct API
      calls unless the component owns the complete workflow.
- [ ] Add barrel exports only at stable feature boundaries and avoid circular
      imports.
- [ ] Record component ownership and deletion/migration steps before extracting
      code so old and new implementations do not coexist indefinitely.

Current size signals include `LoginPage.jsx`, `MfaPanel.jsx`, `AccountPage.jsx`,
`AddUserPage.jsx`, `PointsPage.jsx`, and `Drivers.css`. Size alone is not a bug;
split where responsibilities and tests have become difficult to reason about.

### UI-021: Shared Design-System Contract

- [ ] Inventory buttons, icon buttons, links, badges, cards, inputs, selects,
      menus, dialogs, page headers, stat tiles, skeletons, and state panels.
- [ ] Define approved variants and sizes rather than copying visually similar
      page-local class blocks.
- [ ] Establish spacing, typography, radius, shadow, border, status-color,
      content-width, and z-index tokens with semantic names.
- [ ] Document when a control is a link versus a button and prevent CSS from
      making unlike semantics look ambiguously identical.
- [ ] Standardize form-label, helper-text, required-marker, field-error, and
      submit-feedback placement.
- [ ] Standardize toolbar wrapping and responsive order for search, filters,
      counts, and primary actions.
- [ ] Add every supported variant and interactive state to the component
      playground with keyboard-accessible controls.
- [ ] Consider Storybook only if the team will maintain it; the existing
      playground is sufficient if it becomes a deliberate component catalog.

### UI-022: Accessibility Audit and Automated Baseline

- [ ] Run keyboard-only journeys for authentication, Account, Users, Drivers,
      Driver Detail, Points, Home, About, and every dialog/menu.
- [ ] Verify landmarks, heading order, accessible names, form associations,
      focus-visible styling, focus trapping/return, and status announcements.
- [ ] Test color contrast for normal, muted, disabled, warning, success, error,
      and point-change treatments in both themes.
- [ ] Confirm content reflows at `200%` zoom and text remains usable with browser
      text-size overrides.
- [ ] Audit reduced-motion handling for the truck, road, playground, skeletons,
      menus, and any future transitions.
- [ ] Add `jest-axe` or an equivalent focused accessibility assertion layer for
      shared components and important page states; do not treat it as a
      substitute for manual testing.
- [ ] Run a browser-level Lighthouse/axe check on representative routed pages in
      CI when the workflow is stable.
- [ ] Document known exceptions with owners and target sprints.

### UI-023: Date, Time, Number, and Copy Formatting

- [ ] Centralize ISO timestamp parsing and local display rather than repeating
      `toLocaleString` options in page components.
- [ ] Use the agreed American date order and 12-hour clock while preserving the
      machine-readable ISO value in API data and semantic markup where useful.
- [ ] Define behavior for invalid/missing timestamps and avoid showing
      `Invalid Date`.
- [ ] Centralize signed point formatting, pluralization, large-number grouping,
      and zero handling.
- [ ] Ensure sorting and filtering use raw values rather than formatted strings.
- [ ] Decide whether the UI names the local time zone when audit precision is
      important.
- [ ] Add deterministic tests that do not depend on a developer machine's locale
      or time zone.

### UI-024: Frontend Performance and Asset Budget

- [ ] Measure the current production bundle before choosing optimizations.
- [ ] Evaluate route-level lazy loading for Administrator, playground, legal,
      and other infrequently used feature bundles.
- [ ] Keep the playground and mockup-only assets out of ordinary production
      paths when possible.
- [ ] Optimize uploaded/displayed profile images and decorative assets with
      explicit dimensions to reduce layout shift.
- [ ] Avoid premature memoization; profile real render or network bottlenecks.
- [ ] Define a practical bundle-size warning threshold and track meaningful
      regressions in CI.
- [ ] Verify loading transitions remain accessible and do not flash stale role
      data during sign-in, sign-out, or view-as changes.

## Tooling, Dependencies, and Repository Policy

### DX-010: Decide Python Dependency Ownership

The current root `pyproject.toml` configures Ruff only. It has no `[build-system]`
or `[project]` metadata and therefore does not install Django or any backend
runtime dependency. For now, `backend/requirements.txt` and
`backend/requirements-dev.txt` are required by local setup, Docker, and CI.

- [ ] Decide deliberately between retaining pip requirements files and adopting
      a PEP 621 project plus a lock/compile workflow such as `uv` or `pip-tools`.
- [ ] If retaining requirements files, document which file is authoritative and
      how transitive versions are reproducibly locked and upgraded.
- [ ] If adopting `[project.dependencies]`, update Docker, CI, deployment,
      editor setup, and contributor commands in the same migration.
- [ ] Keep runtime dependencies separate from linting, formatting, testing,
      typing, and other development-only tools.
- [ ] Avoid declaring the same dependency versions manually in both
      `pyproject.toml` and requirements files without an automated generation
      direction.
- [ ] Confirm `mysqlclient` build prerequisites on Windows, macOS, CI Linux, and
      the deployment image before changing installers.
- [ ] Add a documented dependency-update procedure and verify a clean install
      after each lockfile or requirements change.
- [ ] Keep `frontend/package.json` and `frontend/package-lock.json`; Python
      packaging cannot manage React/npm dependencies.

### DX-011: Expand `pyproject.toml` Carefully

- [ ] Keep Ruff configuration centralized and correct the `known-first-party`
      list when package names change; `good_driver` appears historical and
      should be verified against the current `config` package.
- [ ] Add Coverage.py configuration if backend coverage becomes an enforced
      signal.
- [ ] Evaluate static typing incrementally with mypy/Pyright and Django/DRF
      support on service and boundary modules before requiring the entire legacy
      codebase to pass.
- [ ] Configure the selected test/task/dependency tools in `pyproject.toml` only
      when they are actually adopted; do not turn it into a wish-list config.
- [ ] Add tool exclusions for generated media, local databases, frontend build
      output, and migrations consistently across tools.
- [ ] Document which settings are repository policy and which are developer
      editor preferences.

### DX-012: CI and Local Quality-Command Parity

- [ ] Run Ruff check and Ruff format check in CI; Ruff exists in
      `requirements-dev.txt` but the current backend CI installs only
      `requirements.txt` and does not invoke it.
- [ ] Run frontend ESLint, Stylelint, Prettier check, and Markdownlint in CI;
      current CI tests/builds but does not run those existing scripts.
- [ ] Decide whether checks are separate fast jobs or ordered steps with useful
      failure output.
- [ ] Add backend coverage reporting and choose an initial baseline before
      introducing a ratcheting threshold.
- [ ] Keep check commands non-mutating in CI and provide matching local fix
      commands.
- [ ] Cache dependencies using the actual authoritative lock or requirements
      files after DX-010 is resolved.
- [ ] Ensure documentation-only changes still receive Markdown and secret
      checks without running an unnecessary production deployment.
- [ ] Add a single documented local pre-push command that matches required CI
      checks.

### DX-013: Runtime Versions and Editor-Neutral Setup

- [ ] Declare supported Python and Node versions in one authoritative place and
      keep README, CI, Docker, and local setup aligned.
- [ ] Consider `.python-version` and `.nvmrc` or equivalent manager-neutral
      files if the team uses compatible version managers.
- [ ] Add a root `.editorconfig` for line endings, final newlines, indentation,
      and trailing whitespace across Windows and macOS.
- [ ] Keep editor-specific settings optional and do not require committing a
      `.vscode` directory merely to run the project.
- [ ] Verify LF/CRLF policy does not make shell scripts fail in deployment or
      create repository-wide formatting churn.
- [ ] Add clean-clone setup checks on both Windows and macOS before calling the
      workflow universal.

### DX-014: Dependency Maintenance and Security Checks

- [ ] Configure Dependabot or Renovate for npm, Python, GitHub Actions, and
      Docker dependencies with a reviewable update cadence.
- [ ] Add `pip-audit` or an equivalent Python dependency advisory check.
- [ ] Define how `npm audit` findings are triaged; do not use an unreviewed
      `npm audit fix --force` that silently changes major versions.
- [ ] Pin GitHub Actions to reviewed major versions or immutable SHAs according
      to the team's security policy.
- [ ] Record license compatibility for newly added production dependencies and
      keep `THIRD_PARTY_NOTICES.md` current.
- [ ] Assign owners and deadlines for actionable vulnerabilities rather than
      allowing advisory output to become ignored noise.

### DX-015: React Build-Tool Modernization Decision

- [ ] Record that the frontend currently uses `react-scripts` 5 and evaluate its
      maintenance, React 19 compatibility, security advisories, and build needs.
- [ ] Compare remaining on Create React App with a controlled migration to Vite
      or another actively maintained tool.
- [ ] Inventory environment-variable semantics, proxy/API behavior, Jest setup,
      SVG/CSS handling, production asset paths, Docker/Caddy expectations, and
      CI commands before choosing a replacement.
- [ ] Prototype migration on a branch and require test, lint, build, deep-link,
      and deployed static-asset parity.
- [ ] Do not combine a build-tool migration with page redesigns or dependency
      mass-upgrades.

### DX-016: API Contract and Documentation

- [ ] Generate and maintain an OpenAPI schema for authentication, Account,
      Administrator Users, Drivers, points, Sponsor settings, About, and health
      endpoints.
- [ ] Standardize pagination, validation errors, permission errors, not-found
      responses, timestamps, and enum values before more clients depend on them.
- [ ] Document session/CSRF requirements and view-as behavior without exposing
      security-sensitive implementation details.
- [ ] Add contract tests for the fields consumed by each role-specific Home and
      detail page.
- [ ] Decide whether generated frontend types are worthwhile; do not introduce
      a code-generation pipeline without an owner and drift check.
- [ ] Link the schema and data dictionary from the root README.

## Suggested Commit Groups

### Group A: Link-State Polish

- UI-001 Point History Driver links
- UI-002 Pending Driver hover color
- UI-003 shared text-link convention, if the audit produces a small safe change

### Group B: Checkbox Foundation

- UI-004 shared checkbox component, styles, playground example, and tests

### Group C: Checkbox Migrations

- Account-creation legal agreement
- Registration-verification setting
- Sponsor Driver MFA requirement
- UI-005 stable status badge and responsive layout

### Group D: Verification Code Input

- UI-006 shared component
- Sign-in migration
- Account MFA setup/verification migration

### Group E: Sidebar Collapse

- UI-007 approved mockup, shell state, persistence decision, responsive behavior,
  and tests

### Group F: Shared Road Foundation

- UI-008 road implementation and theme decision
- Only the minimum consumer migrations needed to prove the shared variant

### Group G: Vehicle Corrections

- UI-009 semi-truck refinement
- UI-010 bus door corrections
- UI-011 remaining vehicle refinements, one vehicle per commit
- Playground and asset-test updates

### Group G2: Scenery, People, and Effect Refinement

- UI-012 scenery and street assets
- UI-013 people, animal, and effect assets
- Playground scene updates after each refinement

### Group H: Asset Placement

- UI-015 audit and approved placements, split by feature when practical

### Group I: Migration Hygiene

- DX-001 investigation, migration plan, tests, and documentation

### Group J: Developer Commands

- DX-002 universal startup entry point
- DX-003 universal setup entry point
- README and development-documentation updates

### Group K: Tooling Policy

- DX-004 formatter evaluation and written decision
- Configuration and CI changes only after the decision is approved

### Group L: Offline Demo Foundation

- DX-005 deterministic demo-data management command
- DX-006 authoritative About-release workflow
- DX-009 local-data backup and reset safety
- Documentation updates after the commands replace manual shell snippets

### Group M: Environment and Database Confidence

- DX-007 environment doctor and explicit database reporting
- DX-008 SQLite/MySQL compatibility checks
- Integration with the universal setup/start workflow

### Group N: Offline and Organization UX

- UI-016 unified backend-unavailable experience
- UI-017 Sponsor Organization administration, preferably split into API and UI
  commits
- UI-018 role/state smoke-test matrix and matching automated coverage

### Group O: Feedback and Accessibility Foundation

- UI-019 route-state and error-boundary family
- UI-022 accessibility audit and initial automated assertions
- Mockups for 403, 404, maintenance, outage, and unexpected-error states

### Group P: Frontend Decomposition

- UI-020 split one high-value page/workflow at a time
- UI-021 adopt shared design-system variants as extractions require them
- Preserve behavior with characterization tests before structural changes

### Group Q: Formatting and Performance Utilities

- UI-023 shared date/time/number formatters and deterministic tests
- UI-024 measured asset/bundle improvements in separate commits

### Group R: Dependency and Project Metadata Decision

- DX-010 written Python dependency ownership decision
- DX-011 only the `pyproject.toml` changes justified by adopted tools
- DX-013 runtime-version and `.editorconfig` policy

### Group S: CI Quality Parity

- DX-012 existing lint/format/documentation checks in CI
- DX-014 dependency maintenance and advisory checks
- Avoid mixing automatic dependency upgrades into the workflow commit

### Group T: Build and API Contracts

- DX-015 build-tool investigation and isolated proof of concept before migration
- DX-016 API schema and contract standardization in backend-focused commits

### Group U: Sprint 5 Catalog Mockups

- S5-UI-001 Sponsor Catalog management and Add Product workflow
- S5-UI-002 Driver Catalog and every affordability/availability combination
- S5-UI-003 shared Catalog card/playground contract
- Store approved responsive references before implementation

### Group U2: Sprint 5 Commerce Assets

- UI-014 store, cart, packaging, order-status, delivery, and points-token assets
- Catalog, Cart, and Orders navigation icons
- Playground examples before any page placement (UI-015)

### Group V: Sprint 5 Account and Security Mockups

- S5-UI-004 Driver Notification Preferences and point-change alerts
- S5-UI-005 phone verification and suspicious-login feedback
- S5-UI-006 authentication rate-limit/reset/password states
- Coordinate these mockups with the teammates who own their API stories

## Deferred Questions

- [ ] Which existing green hyperlink has the preferred visual weight?
- [ ] Should visited links receive a distinct treatment inside the authenticated
      application?
- [ ] Should the sidebar collapsed state persist per browser or reset on every
      session?
- [ ] Should the custom checkbox support an indeterminate state now, or only when
      a real bulk-selection workflow needs it?
- [ ] Should registration email verification adopt the six-box code input, or
      remain a single field for easier password-manager and email-client paste?
- [ ] Should the shared road use one neutral surface or distinct light/dark
      variants?
- [ ] Which existing assets belong in functional states, and which should remain
      playground-only decoration?
- [ ] Should the school bus STOP arm stay on the visible (curb) side for
      readability, or move to the driver side and only appear when facing the
      other way?
- [ ] Which store types match the products sponsors will actually list, and
      should the truck-stop store be the default Catalog illustration?
- [ ] Should cart and order illustrations animate on state changes (item added,
      order placed), or stay static to keep checkout calm?
- [ ] Should the universal startup command manage both Django and React, or keep
      their long-running processes separate?
- [ ] Which task runner or Python entry-point approach should own the
      `pyproject.toml` commands?
- [ ] Does `mellow-fmt` support every language and platform this repository needs
      well enough to replace an existing tool, or should it be rejected after
      evaluation?
- [ ] Should demo data use one canonical dataset with options, or separate
      named scenario fixtures?
- [ ] Should the demo-data command generate a disposable password, prompt for
      one, or require an explicitly local environment value?
- [ ] What is the authoritative source of About release metadata: migrations,
      a fixture, a command, or the Git release workflow?
- [ ] Should an app-wide offline notice retain last-known authenticated data or
      replace it until the session can be revalidated?
- [ ] Should Sponsor Organizations be archived, deactivated, or both when they
      still own related accounts and historical transactions?
- [ ] Should approved mockups live directly in this repository, Lucidchart, or
      another versioned design source, and who approves a state as canonical?
- [ ] Is the existing component playground sufficient as the design-system
      catalog, or would the team consistently maintain Storybook?
- [ ] Which Python dependency source will be authoritative: compiled
      requirements files or PEP 621 metadata plus a lock tool?
- [ ] Should the frontend remain on `react-scripts` through the capstone or
      schedule an isolated Vite migration after the current sprint?
- [ ] What backend and frontend coverage baselines are realistic now, and how
      should they increase without rewarding low-value tests?
- [ ] Which timestamp displays require an explicit time-zone label in addition
      to local American date and 12-hour time?
- [ ] Should API types remain hand-maintained JavaScript contracts or eventually
      be generated from OpenAPI after the schema stabilizes?
- [ ] Should the Sprint 5 destination be labeled `Catalog` or `Rewards`, and
      should Drivers and Sponsors use the same route?
- [ ] Are Sprint 5 product images uploaded files, validated external URLs, or an
      external product-provider field?
- [ ] Is product description part of the Sprint 5 card/form contract, and does
      any story actually authorize a Product Detail page?
- [ ] Is a zero-point product valid, and if so, is it displayed as `0 points` or
      `Free`?
- [ ] Should unavailable state take visual precedence over unaffordable state
      while still exposing both explanations?
- [ ] Does Sprint 5 include any product-detail editing or only creation and
      availability changes?
- [ ] Where should a suspicious-login notice send the Driver for a security
      response when they do not recognize the activity?
