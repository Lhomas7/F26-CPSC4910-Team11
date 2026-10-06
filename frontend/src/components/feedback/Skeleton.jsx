import './Skeleton.css';

// Shimmering placeholder shown while content loads. Pages size it with
// className; children (e.g. "Loading") can give an inline skeleton its width.
export default function Skeleton({ className = '', children }) {
  return <span className={`skeleton ${className}`.trim()}>{children}</span>;
}
