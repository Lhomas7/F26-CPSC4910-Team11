# Future Sprint Story Candidates

Draft product stories to consider during future sprint planning. These are not
assigned work or commitments. Before scheduling one, search Azure DevOps for an
equivalent story, reuse its ID when appropriate, and add an owner, estimate,
acceptance criteria, and implementation tasks there.

Use [PROJECT_TODO.md](PROJECT_TODO.md) for shared engineering work and
[UI_TODO.md](UI_TODO.md) for Kylie's UI refinements. This document collects
candidate product stories and the outcomes they should deliver.

## Visual accessibility and appearance

Goal: make the shared UI usable for people with low vision, color-vision
differences, and sensitivity to motion. Build on the existing light/dark mode.
Use [WCAG 2.2 Level AA](https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2&levels=a%2Caa)
as the engineering target. Accessibility settings alone do not establish ADA
compliance or WCAG conformance; the default experience and complete user
workflows also need verification. The criteria below are a starting scope,
not a complete WCAG checklist.

### A11Y-01 — Accessible default colors and status cues

**Story:** As a user with low vision or a color-vision difference, I want text,
controls, and status information to remain distinguishable so that I can use
the application without depending on color alone.

**Acceptance criteria:**

- [ ] Audit shared design tokens and page-specific colors in light and dark mode.
- [ ] Normal text meets at least 4.5:1 contrast; qualifying large text meets 3:1.
- [ ] Required control boundaries, meaningful graphics, and state indicators
      meet applicable 3:1 non-text contrast requirements.
- [ ] Errors, success states, pending status, point awards/deductions, product
      availability, and affordability include text or another non-color cue.
- [ ] Links and selected controls remain identifiable without color perception.

**Task candidates:** inventory colors; revise shared tokens; replace color-only
states; verify representative screens and interaction states.

### A11Y-02 — High-contrast appearance

**Story:** As a user with low vision, I want a high-contrast appearance option
so that text, controls, and focus indicators are easier to distinguish.

**Acceptance criteria:**

- [ ] Provide high-contrast choices compatible with light and dark appearance.
- [ ] Apply the choice to the shell, forms, dialogs, tables, cards, alerts,
      navigation, and interactive states through shared tokens.
- [ ] Preserve clear boundaries and status cues without relying on shadows.
- [ ] Support Windows High Contrast / browser forced-colors behavior without
      overriding the user's selected system colors unnecessarily.
- [ ] Document measured contrast targets and verify the resulting palettes.

**Task candidates:** mock contrast variants; implement contrast tokens; support
forced colors; review full workflows in each supported appearance.

### A11Y-03 — Color-vision-friendly palettes

**Story:** As a user with a color-vision difference, I want optional alternative
palettes so that I can distinguish important states comfortably.

**Acceptance criteria:**

- [ ] Review palette options for protan, deutan, and tritan color-vision differences.
- [ ] Offer clearly named previews and a way to return to the default palette.
- [ ] Keep palette choice independent of light/dark mode and contrast preference.
- [ ] Preserve text labels and icons even when a palette is selected.
- [ ] Verify actual contrast and use simulations as supporting checks; a
      simulation alone does not prove usability.
- [ ] Apply semantic color tokens instead of a global filter that changes
      product photos or profile images.

**Task candidates:** design palette previews; extend semantic tokens; build the
selector; review charts, point history, badges, errors, and catalog states.

### A11Y-04 — Text size, spacing, and reflow

**Story:** As a user who needs larger text, I want readable text and adaptable
layouts so that I can enlarge content without losing information or controls.

**Acceptance criteria:**

- [ ] Support browser text resizing to 200% without loss of content or function.
- [ ] Verify reflow at an effective width of 320 CSS pixels, including 400% zoom
      on an appropriately sized desktop viewport; document legitimate exceptions
      for content such as two-dimensional data tables.
- [ ] Allow WCAG text-spacing overrides without clipping or overlapping content.
- [ ] Offer an optional larger-text preference using relative units and shared tokens.
- [ ] Keep dialogs, menus, toolbars, filters, and form errors usable at larger sizes.

**Task candidates:** audit fixed dimensions; add text-size tokens; repair reflow;
verify zoom, spacing, long labels, and narrow layouts.

### A11Y-05 — Visible focus and accessible shared controls

**Story:** As a user navigating with a keyboard or assistive technology, I want
clear focus and predictable controls so that I can complete the same workflows.

**Acceptance criteria:**

- [ ] Interactive controls have visible focus that is not hidden behind sticky UI.
- [ ] Navigation, account menus, custom selects, export dialogs, and modals work
      with the keyboard and expose accessible names and states.
- [ ] Dialogs manage focus and return it to the invoking control when appropriate.
- [ ] Provide a skip-to-content link and meaningful page headings.
- [ ] Expose form errors and asynchronous status updates to assistive technology.
- [ ] Verify applicable WCAG 2.2 AA target-size requirements for shared controls.

**Task candidates:** audit shared primitives; fix keyboard/focus behavior; verify
screen-reader announcements; test authentication and role-specific workflows.

### A11Y-06 — Reduced motion and animation controls

**Story:** As a user sensitive to motion, I want decorative animation reduced
or stopped so that I can use the application comfortably.

**Acceptance criteria:**

- [ ] Honor `prefers-reduced-motion` by default.
- [ ] Provide a manual reduced-motion preference and static decorative assets.
- [ ] Review the moving truck, road animations, transitions, and loading effects.
- [ ] Provide pause/stop controls where required for automatically moving content.
- [ ] Keep loading and completion feedback understandable when animation is off.

**Task candidates:** inventory animation; add a shared motion preference; create
static fallbacks; verify manual and operating-system preferences.

### A11Y-07 — Appearance preferences panel

**Story:** As a user, I want one accessible place to configure and reset my
appearance preferences so that the application remains comfortable to use.

**Acceptance criteria:**

- [ ] Group theme, contrast, palette, text size, and reduced motion in a clearly
      labeled panel, including access before sign-in.
- [ ] Preview changes immediately and provide a reset-to-defaults action.
- [ ] Define how explicit choices interact with operating-system preferences.
- [ ] Retain browser preferences after reload and sign-out; handle unavailable
      browser storage gracefully.
- [ ] Document whether cross-device account synchronization is in scope before
      adding backend preference storage.
- [ ] Make every panel control usable with keyboard and screen reader.

**Task candidates:** mock the panel; define preference precedence and storage;
integrate existing theme controls; verify reload, sign-out, and reset behavior.

### Suggested delivery order and evidence

1. Audit default colors and shared controls (A11Y-01 and A11Y-05).
2. Establish shared preference handling and the settings panel (A11Y-07).
3. Add high contrast and alternative palettes (A11Y-02 and A11Y-03).
4. Complete larger text, reflow, and reduced motion (A11Y-04 and A11Y-06).
5. Review complete Driver, Sponsor, and Administrator workflows with automated
   accessibility checks, manual keyboard checks, zoom, forced colors, and a
   screen reader. Record findings and fixes; automated checks are only part
   of the evidence.

Split stories further during estimation if a shared-control or page audit is
too large for one sprint. Accessible defaults should not depend on enabling a
special mode.

## Report export follow-up candidates

These were proposed during Sprint 8 planning. Reuse the Sprint 8 work items if
created, and move only unfinished scope to a future sprint.

- [ ] **Spreadsheet exports:** As an administrator, I want to export the filtered
      sales report as CSV or Excel so that I can analyze and share its data.
      Include all matching records, consistent totals, authorization, safe CSV
      values, and an accessible format-selection dialog.
- [ ] **Formatted exports:** As an administrator, I want to download the filtered
      report as HTML or PDF so that I can share or print a readable report.
      Include applied filters, generation time, readable tables, and page breaks.

## Additional candidates

Add new entries with a draft story, intended outcome, acceptance criteria,
dependencies, and an existing Azure DevOps ID when available. Estimates and
sprint assignments belong to planning after scope review.
