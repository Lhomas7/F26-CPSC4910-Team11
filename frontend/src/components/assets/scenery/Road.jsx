import './Road.css';

// A stretch of road to stage scenes on. It fills its container's width;
// place assets inside it with absolute positioning (or a flex row).
// lanes={2} draws a dashed centre line; shoulders draws solid edge lines.
export default function Road({ lanes = 2, shoulders = true, className = '', style, children }) {
  const classes = [
    'asset-road',
    lanes > 1 ? 'asset-road-dashed' : '',
    shoulders ? 'asset-road-shoulders' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={style} aria-hidden="true">
      {children}
    </div>
  );
}
