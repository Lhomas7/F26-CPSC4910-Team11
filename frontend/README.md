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
├── api/              # Shared client and domain endpoint modules
├── app/              # Routing, application shell, and layout
├── auth/             # Session/authentication context
├── components/       # Shared cross-feature components
├── data/             # Shared reference data
├── features/         # Feature-owned pages, tests, and styles
└── utils/            # Shared validation and utility functions
```

Feature tests and styles should remain beside their implementations. Shared API
transport belongs in `src/api/client.js`; domain endpoint functions belong in
the corresponding module under `src/api/`.

See [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for the Docker Compose, Caddy,
EC2, and GitHub Actions deployment path.
