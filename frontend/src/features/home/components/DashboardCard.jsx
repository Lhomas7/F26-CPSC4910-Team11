import { cloneElement } from 'react';

import { ArrowRightIcon } from '../../../components/primitives/Icons';

export default function DashboardCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`card dashboard-card ${className}`.trim()} aria-label={title}>
      <div className="dashboard-card-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action &&
          cloneElement(
            action,
            {
              className: [action.props.className, 'dashboard-card-action']
                .filter(Boolean)
                .join(' '),
            },
            <>
              {action.props.children}
              <ArrowRightIcon size={13} />
            </>,
          )}
      </div>
      <div className="dashboard-card-body">{children}</div>
    </section>
  );
}
