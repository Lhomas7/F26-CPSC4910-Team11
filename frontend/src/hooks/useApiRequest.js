import { useCallback, useEffect, useRef, useState } from 'react';

/** Map a failed request to a page status. */
export function statusForError(error) {
  if (error?.status === 403) return 'forbidden';
  if (error?.status === 404) return 'not-found';
  return 'error';
}

/**
 * Load data for a page and track where the request is.
 *
 *   const { data, setData, status, error, reload } = useApiRequest(
 *     useCallback(() => api.getThing(id), [id]),
 *   );
 *
 * `request` must be a stable function (wrap it in useCallback); it runs on
 * mount and again whenever it changes. `status` is 'loading', 'ready',
 * 'error', 'forbidden' (403) or 'not-found' (404).
 *
 * Options:
 * - skip: don't request at all (e.g. the user's role can't see the page);
 *   status stays 'loading' until skip turns false.
 * - onSuccess(data): runs after each successful load, e.g. to fill a form.
 *
 * Responses from an older request, or arriving after the component has gone,
 * are ignored, so a slow first load can never overwrite a newer one.
 * `setData` updates the loaded data locally, e.g. after saving an edit.
 */
export default function useApiRequest(request, { skip = false, onSuccess } = {}) {
  const [state, setState] = useState({ data: null, status: 'loading', error: null });
  const latest = useRef(0);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const reload = useCallback(async () => {
    const requestId = latest.current + 1;
    latest.current = requestId;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const data = await request();
      if (latest.current !== requestId) return;
      setState({ data, status: 'ready', error: null });
      onSuccessRef.current?.(data);
    } catch (error) {
      if (latest.current !== requestId) return;
      setState((current) => ({ ...current, status: statusForError(error), error }));
    }
  }, [request]);

  useEffect(() => {
    if (skip) return undefined;
    reload();
    // Bumping the id on cleanup makes any in-flight response stale.
    return () => {
      latest.current += 1;
    };
  }, [reload, skip]);

  const setData = useCallback((update) => {
    setState((current) => ({
      ...current,
      data: typeof update === 'function' ? update(current.data) : update,
    }));
  }, []);

  return { ...state, setData, reload };
}
