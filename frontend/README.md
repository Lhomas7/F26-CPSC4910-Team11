# Good Driver frontend

This directory contains the React frontend for the Good Driver Incentive
Program. The repository-level [`README.md`](../README.md) is the authoritative
source for full-stack setup, environment configuration, database instructions,
and the Windows/macOS launch workflow.

## Requirements

- Node.js 20 is used by CI.
- npm and the checked-in `package-lock.json` manage dependencies.
- The Django API normally runs at `http://localhost:8000/api`.

## Setup and launch

The commands are identical in PowerShell, macOS Terminal, and Linux shells:

```shell
cd frontend
npm install
npm start
```

The development server normally opens `http://localhost:3000`.

`frontend/.env` is optional. The API client defaults to
`http://localhost:8000/api`. To use another backend address:

```shell
cp .env.example .env
```

PowerShell users can use the equivalent copy command:

```powershell
Copy-Item .env.example .env
```

Set `REACT_APP_API_URL` in that file and restart `npm start`. Never store
passwords, database credentials, or private keys in a frontend environment
variable; React embeds these values in browser-delivered code.

## Tests and production build

Run the same non-watch test command used by CI:

```shell
npm test -- --watchAll=false --runInBand
npm run build
```

CI sets `CI=true` and builds with `REACT_APP_API_URL=/api`. The generated
`frontend/build/` directory is deployment output and should not be committed.

## Source organization

```text
src/
├── api/                         # Shared HTTP client and domain endpoint modules
│   ├── about.js
│   ├── accounts.js
│   ├── adminUsers.js
│   ├── authentication.js
│   ├── client.js
│   └── drivers.js
├── app/                         # Routes, responsive shell, layout, and page headers
├── auth/                        # Authentication context and session events
├── components/                  # Shared UI used by more than one feature
│   ├── assets/                  # Illustrated asset library
│   │   ├── effects/             # Collision, flame, impact, and smoke effects
│   │   ├── people/              # Reusable people illustrations
│   │   ├── scenery/             # Buildings, roads, signs, plants, and street objects
│   │   └── vehicles/            # Cars, buses, trucks, ambulances, and wheels
│   ├── branding/                # BrandMark, ProgramPerks, and RoadTruck
│   ├── feedback/                # Modal, ConfirmDialog, Skeleton, and StatePanel
│   ├── forms/                   # PasswordInput, PasswordRequirements, and SelectMenu
│   └── primitives/              # Avatar and interface Icons
├── data/                         # Shared static/reference data
├── features/                     # Feature-owned pages, tests, and styles
│   ├── about/                    # Product and release information
│   ├── accounts/                 # Profile, password, MFA, and login activity
│   ├── admin-users/              # User directory, creation, details, and settings
│   ├── authentication/           # Login, registration, device check, and password reset
│   ├── drivers/                  # Driver pages, point controls, and linking workflow
│   ├── home/                     # Public welcome page
│   ├── legal/                    # Terms of Service and Privacy Notice
│   ├── playground/               # Development-only shared-asset gallery
│   ├── points/                   # Point balances and history
│   └── sponsors/                 # Sponsor-wide settings and controls
├── hooks/                        # Shared hooks, e.g. useApiRequest for page loading
├── styles/                       # Global styles, imported once in index.js
│   ├── tokens.css                # Colours (light and dark), shared values, breakpoints
│   ├── base.css                  # Element defaults and focus ring
│   ├── components.css            # .button, .banner, .badge, .card, .stat, .chip
│   └── utilities.css             # .sr-only and other helpers
└── utils/                        # Shared validation and utility functions
```

Every feature uses the same layout:

```text
features/<feature>/
├── pages/            # Routed pages (*Page.jsx) with their tests
├── components/       # Panels, forms, and dialogs used by this feature's pages
├── <Feature>.css     # Styles shared by several files in the feature (optional)
└── index.js          # What other code may import from the feature
```

`app/` and other features import a feature only through its `index.js`
(`import { PointsPage } from '../features/points'`). A stylesheet sits beside
the one file that imports it; when several files in a feature share it, it sits
at the feature root.

### Styling

Colours and other shared values are CSS custom properties in
`src/styles/tokens.css`, each with a light and a dark value, so components
never write their own dark-mode colour overrides. Buttons, banners, badges,
cards, stat tiles, and filter chips come from the shared classes in
`src/styles/components.css` (`button button-primary`, `banner banner-error`,
`badge badge-success`, `card`, …). Feature stylesheets add only layout and
spacing, and use the two breakpoints documented in `tokens.css` (53.75rem and
42rem).

### Loading data

Pages load data with `useApiRequest` from `src/hooks/`, which tracks
loading/ready/error/forbidden/not-found states, retries, and ignores stale
responses.

Feature tests and styles should remain beside their implementations. Shared API
transport belongs in `src/api/client.js`; domain endpoint functions belong in
the corresponding module under `src/api/`. A component belongs in
`src/components/` only when multiple features use it or it is part of the
shared visual system; feature-specific panels and forms stay inside their own
feature directory. Within `components/`, use `branding/` for program identity,
`feedback/` for application states and overlays, `forms/` for reusable input
controls, `primitives/` for small foundational UI, and `assets/` for reusable
illustrations grouped by visual domain.

See [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for the Docker Compose, Caddy,
EC2, and GitHub Actions deployment path.
