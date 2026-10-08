# Linting and Formatting

This project uses language-specific tools rather than treating formatting, linting, framework checks, and tests as the same operation.

| Scope              | Linter or check                    | Formatter            |
| ------------------ | ---------------------------------- | -------------------- |
| JavaScript and JSX | ESLint                             | Prettier             |
| CSS                | Stylelint                          | Prettier             |
| Markdown           | Markdownlint                       | Prettier when needed |
| Python             | Ruff                               | Ruff Formatter       |
| Django             | Django system and migration checks | Not applicable       |

The checked-in configuration files are the source of truth:

- `frontend/package.json` defines frontend and documentation commands.
- `frontend/.prettierrc.json` and `frontend/.prettierignore` define frontend formatting.
- `frontend/stylelint.config.cjs` defines CSS rules.
- `frontend/.markdownlint.json` defines documentation rules.
- `pyproject.toml` defines Python linting and formatting.
- `.editorconfig` and `.gitattributes` keep whitespace and line endings consistent across Windows, macOS, Linux, and CI.

## First-time setup

### Frontend and documentation tools

From `frontend/`:

```powershell
npm install
```

This installs the application dependencies and the checked-in development tools, including Prettier, Stylelint, `stylelint-config-standard`, and `markdownlint-cli2`. Teammates should not add those packages again after cloning or pulling; they are already declared in `package.json` and locked in `package-lock.json`.

Use `npm ci` instead when reproducing CI or installing from the committed lockfile without changing dependency resolution:

```powershell
npm ci
```

The one-time maintainer command originally used to add the lint and formatting tools was:

```powershell
npm install --save-dev prettier stylelint stylelint-config-standard markdownlint-cli2
```

Run that form only when intentionally adding or upgrading the tools and committing the resulting `package.json` and `package-lock.json` changes. For ordinary setup, use `npm install` or `npm ci`.

Do not install Expo tooling in this repository. This frontend is a Create React App web application, not an Expo or React Native application.

### Backend tools on Windows

From `backend/`:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
```

### Backend tools on macOS or Linux

From `backend/`:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
```

`requirements-dev.txt` includes the runtime requirements and development-only tools such as Ruff. The project targets Python 3.12 because CI and the production container use Python 3.12. A newer local interpreter may be used as long as committed code remains compatible with the configured `py312` Ruff target.

## Everyday checks

### Frontend source

From `frontend/`:

```powershell
npm run lint
npm run format:check
npm test -- --watchAll=false
```

`npm run lint` runs both ESLint and Stylelint. Individual checks are also available:

```powershell
npm run lint:js
npm run lint:css
```

### Documentation

From `frontend/`:

```powershell
npm run lint:docs
```

The command checks Markdown files in the repository root and `docs/`.

### Backend source

Activate the backend virtual environment, then run from `backend/`:

```powershell
ruff check .
ruff format --check .
```

Run Django checks and tests against SQLite so local verification does not depend on the shared AWS database:

```powershell
$env:DB_ENGINE = "sqlite"
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
Remove-Item Env:DB_ENGINE
```

On macOS or Linux, prefix each Django command with `DB_ENGINE=sqlite`:

```bash
DB_ENGINE=sqlite python manage.py check
DB_ENGINE=sqlite python manage.py makemigrations --check --dry-run
DB_ENGINE=sqlite python manage.py test
```

## Applying fixes

Run checks before applying fixes so the resulting changes are understood.

### JavaScript and CSS

From `frontend/`:

```powershell
npm run lint:fix
npm run format
```

ESLint and Stylelint fix only supported rules. Prettier owns layout, indentation, wrapping, quotes, and other formatting decisions.

### Markdown

From `frontend/`:

```powershell
npx markdownlint-cli2 --fix "../*.md" "../docs/**/*.md"
npx prettier --write "../README.md" "../docs/**/*.md"
npm run lint:docs
```

Review documentation changes manually. Automatic tools cannot determine whether wording, links, headings, or generated tables of contents are semantically correct.

### Python

From `backend/` with the virtual environment activated:

```powershell
ruff check . --fix
ruff check .
ruff format .
ruff format --check .
ruff check .
```

Do not use `ruff check . --unsafe-fixes` without reviewing each proposed change. Some findings, such as exception chaining, can require a deliberate manual decision.

## Required order before committing

1. Run the non-mutating lint and formatting checks.
2. Apply safe fixes.
3. Review `git diff` for behavioral or documentation changes.
4. Rerun all affected checks.
5. Run the affected test suites.
6. Confirm no generated files, secrets, local databases, virtual environments, or dependency directories are staged.

Useful review commands from the repository root:

```powershell
git status --short
git diff --check
git diff --stat
git --no-pager diff
git diff --cached
```

## Tool ownership and guidelines

- Do not manually fight Prettier formatting. Change the shared configuration only through a reviewed team decision.
- Do not disable a lint rule inline merely to make a check pass. First determine whether the code should change or whether the rule conflicts with an intentional project-wide convention.
- Keep lint-rule exceptions narrow and document why the exception is necessary.
- Prefer accessible Testing Library queries such as roles, labels, and visible text. Direct DOM traversal is acceptable only for genuinely decorative, `aria-hidden` structure and should include a short explanation.
- Preserve Python 3.12 compatibility even when developing with a newer Python version.
- Do not lint or format generated migrations merely for style. Historical migrations must not be rewritten after deployment.
- Keep formatting-only changes separate from feature changes whenever practical.
- Run Django tests with SQLite unless intentionally testing shared MySQL integration.

## Dependency audit guidance

`npm install` and `npm audit` may report vulnerabilities inherited through Create React App's build and test dependency tree. Treat every advisory seriously, but evaluate the dependency path and runtime exposure before changing packages.

- Do not run `npm audit fix --force` in this repository. npm may propose destructive or invalid changes such as replacing `react-scripts` with `0.0.0`.
- Prefer narrow, reviewed upgrades of direct or compatible transitive dependencies.
- Run linting and tests after dependency changes.
- Track the remaining Create React App dependency debt as a controlled migration to maintained build tooling rather than forcing incompatible package versions.

Dependency auditing is related to, but separate from, source linting. A clean lint run does not mean the dependency graph has no advisories.

## CI status

The current GitHub Actions workflow runs Django checks, migration checks, backend tests, frontend tests, a production build, and secret scanning. Repository lint and formatting commands must still be run locally until equivalent CI steps are added to `.github/workflows/ci-cd.yml`.

When linting is added to CI, CI should use the same checked-in commands documented here rather than defining a second set of rules.

## Troubleshooting

### A command reports hundreds of findings

Stop before applying automatic fixes. Confirm that the configuration matches the project's conventions and that a formatter is not duplicating a linter's job. Establish large formatting baselines in a dedicated commit.

### Django tries to contact AWS during a check

The local `.env` selects MySQL. Temporarily set `DB_ENGINE=sqlite` for checks and tests as shown above.

### Git opens a full-screen diff view

Press `q` to exit the pager. Use the following command to avoid the pager:

```powershell
git --no-pager diff
```

### Windows and CI disagree about line endings

Do not change the formatter to accommodate one workstation. Keep `.gitattributes`, `.editorconfig`, and the formatter configuration committed so all environments use the same policy.
