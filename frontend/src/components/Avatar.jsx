import { initials } from '../utils/names';
import './Avatar.css';

// Round profile picture that falls back to the person's initials.
// Pages set size and colours through className. Pass `label` when the avatar
// should be announced; otherwise it is hidden from screen readers because the
// name is shown next to it.
export default function Avatar({ name, src, label, className = '' }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };

  return (
    <span className={`avatar ${className}`.trim()} {...a11y}>
      {src ? <img src={src} alt="" /> : initials(name)}
    </span>
  );
}
