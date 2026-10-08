import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

const PageHeaderTargetContext = createContext(undefined);

export function PageHeaderTargetProvider({ target, children }) {
  return (
    <PageHeaderTargetContext.Provider value={target}>{children}</PageHeaderTargetContext.Provider>
  );
}

/** Render page-owned heading content in the shared application topbar. */
export default function PageHeader({ title, subtitle, breadcrumb, actions }) {
  const target = useContext(PageHeaderTargetContext);
  const header = (
    <div className="page-header">
      <div className="page-header-copy">
        {breadcrumb && <div className="page-header-breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );

  // Standalone rendering keeps feature tests and reusable pages self-contained.
  if (target === undefined) return header;
  if (!target) return null;

  return createPortal(header, target);
}
