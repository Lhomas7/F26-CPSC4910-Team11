import './BrandMark.css';

// Road-tile logo: a dark square with a dashed center stripe.
// Pass onDark when it sits on a dark panel so it gets a light outline.
// Size can be overridden by the caller's className.
export default function BrandMark({ onDark = false, className = '' }) {
  const classes = ['brand-mark', onDark ? 'brand-mark-on-dark' : '', className].filter(Boolean).join(' ');
  return <span className={classes} aria-hidden="true" />;
}
