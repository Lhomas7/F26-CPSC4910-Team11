import './StatePanel.css';

// Card for loading failures, empty lists, access-denied and success messages.
// Put the explanation and any actions in children. tone="error" also makes
// the panel a live alert. Pages adjust spacing through className.
export default function StatePanel({
  title,
  headingLevel = 2,
  tone,
  icon,
  className = '',
  children,
}) {
  const Heading = `h${headingLevel}`;
  const classes = ['state-panel', tone ? `state-panel-${tone}` : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} role={tone === 'error' ? 'alert' : undefined}>
      {icon}
      <Heading>{title}</Heading>
      {children}
    </section>
  );
}
