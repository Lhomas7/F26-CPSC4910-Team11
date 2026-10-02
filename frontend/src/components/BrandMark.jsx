import './BrandMark.css';

// Road-tile logo: a dark square with a dashed center stripe.
// Size and background can be overridden by the caller's className.
export default function BrandMark({ className = '' }) {
  return <span className={`brand-mark ${className}`.trim()} aria-hidden="true" />;
}
