import { useEffect, useRef } from 'react';

/** Refresh visible data when returning to the app; coalesce focus/visibility events. */
export default function useRefreshOnReturn(refresh) {
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    let lastRefresh = -Infinity;
    const returned = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      callback.current();
    };
    window.addEventListener('focus', returned);
    document.addEventListener('visibilitychange', returned);
    return () => {
      window.removeEventListener('focus', returned);
      document.removeEventListener('visibilitychange', returned);
    };
  }, []);
}
