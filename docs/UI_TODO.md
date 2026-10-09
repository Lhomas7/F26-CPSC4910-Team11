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
10. Refine and place decorative assets only after their visual direction and
   reduced-motion behavior are agreed upon.

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

- [ ] Increase the semi-truck's visual detail without making it illegible at its
      smallest supported size.
- [ ] Fix the misaligned exhaust pipe.
- [ ] Verify both facing directions, motion states, crash states, and rescue
      animation placement after the drawing changes.
- [ ] Check that detail does not disappear or become noisy in light and dark
      themes.
- [ ] Update asset snapshots/component tests as appropriate.

Primary area: `frontend/src/components/assets/vehicles/SemiTruck.jsx` and its
colocated stylesheet.

### UI-010: Correct Bus Door Placement

- [ ] Review School, City, and Double-Decker bus door placement at normal and
      enlarged playground scales.
- [ ] Move doors to physically plausible positions without overlapping windows,
      wheels, trim, or destination signage.
- [ ] Verify left- and right-facing rendering and all existing animation states.
- [ ] Update asset tests if structure or class names change.

Primary area: `frontend/src/components/assets/vehicles/Buses.jsx` and its
colocated stylesheet.

### UI-011: Asset and Animation Placement Audit

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

### UI-012: Unified Backend-Unavailable Experience

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

### UI-013: Sponsor Organization Administration

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

### UI-014: Demo-State and Role Smoke-Test Matrix

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
- Playground and asset-test updates

### Group H: Asset Placement

- UI-011 audit and approved placements, split by feature when practical

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

- UI-012 unified backend-unavailable experience
- UI-013 Sponsor Organization administration, preferably split into API and UI
  commits
- UI-014 role/state smoke-test matrix and matching automated coverage

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
