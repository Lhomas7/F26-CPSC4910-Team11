import { useId, useLayoutEffect, useRef, useState } from 'react';

import './ClampedText.css';

function MeasuredText({ text, productName }) {
  const textId = useId();
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = textRef.current;
    const measure = () => {
      // Keep Show less available while expanded. Recheck the collapsed height
      // after resize/collapse rather than relying on a character-count guess.
      if (!expanded) setOverflows(node.scrollHeight > node.clientHeight + 1);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [expanded]);

  return (
    <>
      <p
        ref={textRef}
        id={textId}
        className={`catalog-product-description${expanded ? '' : ' is-clamped'}`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          className="button button-link catalog-product-more"
          type="button"
          aria-controls={textId}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Show less of' : 'Show more of'} the description for ${productName}`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  );
}

export default function ClampedText({ text, productName }) {
  if (!text) return null;
  // Replacing a product/description must not inherit the previous expansion.
  return <MeasuredText key={`${productName}\n${text}`} text={text} productName={productName} />;
}
