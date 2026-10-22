import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

function readPage(value) {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export default function useCatalogPagination() {
  const [params, setParams] = useSearchParams();
  const rawPage = params.get('page');
  const page = readPage(rawPage);
  const changePage = useCallback((value, replace = false) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value === 1) next.delete('page');
      else next.set('page', String(value));
      return next;
    }, { replace });
  }, [setParams]);
  const recoverPage = useCallback(() => changePage(1, true), [changePage]);
  useEffect(() => {
    if (rawPage !== null && rawPage !== String(page)) changePage(page, true);
  }, [rawPage, page, changePage]);
  return { page, changePage, recoverPage };
}
