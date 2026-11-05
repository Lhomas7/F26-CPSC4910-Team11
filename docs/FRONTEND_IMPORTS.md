# Frontend import conventions

`frontend/jsconfig.json` sets `baseUrl` to `src`. Create React App uses this for
development, compilation, and Jest module resolution; VS Code uses it for
navigation and completion. Restart a running development server after adding
or changing this configuration.

- Use source-root paths when importing shared code or crossing feature boundaries:
  `api`, `app/PageHeader`, `auth/AuthContext`, `components/forms/SelectMenu`,
  `hooks/useApiRequest`, or `features/cart/useDriverPointsRefresh`.
- Keep imports within the same feature or shared-code folder relative:
  `./ProductImage`, `../components/PointHistoryList`, and `../Points.css`.
- Keep Jest mock/requireActual paths aligned with the imports they replace.
- Use existing feature `index.js` exports as deliberate public interfaces.
  Small category exports, such as `components/feedback`, may group related
  primitives. Export names explicitly; do not create a global components barrel.
- A module inside a feature/category should import its sibling implementation
  directly, rather than through its own index, to avoid circular dependencies.
- The feature root is still `features/`: `points/Points.css` is not a valid
  source-root path; `features/points/Points.css` is.

Import count alone is not a reason to split a component. Extract cohesive UI or
behavior when it improves readability. These conventions change module paths,
not runtime behavior or the backend architecture. No custom Webpack aliases or
additional runtime dependencies are required.
