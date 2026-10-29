import { useEffect, useRef, useState } from 'react';

import { setProductAvailability } from '../../../api/catalog';
import './AvailabilityControl.css';

export default function AvailabilityControl({
  product,
  catalogVersion,
  disabled,
  onSaved,
  onAccessError,
  onRefresh,
}) {
  const [state, setState] = useState({ phase: 'idle' });
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // A fresh catalog read verifies the row again, including after a 404 or
    // uncertain failure. It must not clear a request that is still in flight.
    setState((current) =>
      ['saving', 'idle'].includes(current.phase) ? current : { phase: 'idle' },
    );
  }, [catalogVersion]);

  const save = async (requestedValue) => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setState({ phase: 'saving' });
    try {
      const updated = await setProductAvailability(product.id, requestedValue);
      // The page owns confirmed values and a shared live region. Its identity-
      // scoped callback ignores completion after that account view unmounts.
      onSaved(updated);
      if (mounted.current) setState({ phase: 'idle' });
    } catch (error) {
      if ([401, 403, 409].includes(error.status)) {
        onAccessError(error);
      } else if (mounted.current) {
        setState({
          phase: error.status === 404 ? 'gone' : 'error',
          message: error.message,
          requestedValue,
        });
      }
    } finally {
      inFlight.current = false;
    }
  };

  if (state.phase === 'gone') {
    return (
      <div className="banner banner-error catalog-product-error" role="alert">
        <strong>This product is no longer in your catalog.</strong>
        <p>Refresh the catalog to get the current list.</p>
        <button className="button" type="button" disabled={disabled} onClick={onRefresh}>
          Refresh catalog
        </button>
      </div>
    );
  }

  const saving = state.phase === 'saving';
  const action = product.is_available ? 'Mark unavailable' : 'Mark available';
  return (
    <>
      {state.phase === 'error' && (
        <div className="banner banner-error catalog-product-error" role="alert">
          <strong>Couldn&apos;t update availability.</strong>
          <p>{state.message || 'Try again in a moment.'}</p>
          <p>
            Last confirmed status: {product.is_available ? 'Available' : 'Unavailable'}. Refresh the
            catalog to verify the current value.
          </p>
          <button
            className="button"
            type="button"
            disabled={disabled}
            aria-label={`Retry availability update for ${product.name}`}
            onClick={() => save(state.requestedValue)}
          >
            Try again
          </button>
        </div>
      )}
      <button
        className="button"
        type="button"
        disabled={disabled || saving}
        aria-busy={saving || undefined}
        aria-label={
          saving ? `Saving availability for ${product.name}` : `${action}: ${product.name}`
        }
        onClick={() => save(!product.is_available)}
      >
        {saving ? 'Saving…' : action}
      </button>
    </>
  );
}
