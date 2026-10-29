import { useCallback, useEffect, useRef } from 'react';

import { getCatalog } from '../../../api/catalog';
import useApiRequest from '../../../hooks/useApiRequest';

export default function useCatalogPage(page, onRecovered) {
  const recovered = useRef(null);
  const requestVersion = useRef(0);
  const request = useCallback(async () => {
    const version = ++requestVersion.current;
    // A recovered page-1 response can serve the URL replacement too. Do not
    // refetch it or turn an out-of-range page into a request/recovery loop.
    if (page === 1 && recovered.current) {
      const data = recovered.current;
      recovered.current = null;
      return { ...data, requestedPage: 1 };
    }
    recovered.current = null;
    try {
      return { ...(await getCatalog(page)), page, requestedPage: page, recovered: false };
    } catch (error) {
      if (error.status !== 404 || page === 1) throw error;
      const data = {
        ...(await getCatalog(1)),
        page: 1,
        requestedPage: page,
        recovered: true,
      };
      if (version === requestVersion.current) recovered.current = data;
      return data;
    }
  }, [page]);
  const state = useApiRequest(request);

  useEffect(() => {
    if (
      state.status === 'ready' &&
      state.data?.recovered &&
      state.data.requestedPage === page &&
      page !== 1
    ) {
      onRecovered();
    }
  }, [state.status, state.data, page, onRecovered]);

  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );
  return state;
}
