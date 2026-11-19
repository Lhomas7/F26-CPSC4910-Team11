import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getMySponsors, setActiveSponsor } from 'api';
import useApiRequest from 'hooks/useApiRequest';

const ActiveSponsorContext = createContext(null);

/**
 * A driver's sponsors and the one they're shopping with.
 *
 * Points never mix between sponsors, so there is no combined balance here.
 * `scopeKey` changes whenever the active sponsor changes after the first
 * load (a switch, or the server falling back after a sponsor drops the
 * driver); key sponsor-scoped views on it so they reload that sponsor's data.
 */
export function ActiveSponsorProvider({ children }) {
  const { data, setData, status, error, reload } = useApiRequest(
    useCallback(() => getMySponsors(), []),
  );
  const [scopeKey, setScopeKey] = useState(0);
  const knownActive = useRef(undefined);

  useEffect(() => {
    if (!data) return;
    const activeId = data.active_sponsor_id ?? null;
    if (knownActive.current !== undefined && knownActive.current !== activeId) {
      setScopeKey((key) => key + 1);
    }
    knownActive.current = activeId;
  }, [data]);

  const switchSponsor = useCallback(
    async (sponsorId) => {
      const next = await setActiveSponsor(sponsorId);
      setData(next);
      return next;
    },
    [setData],
  );

  const value = useMemo(() => {
    const memberships = data?.memberships ?? [];
    const approved = memberships.filter((membership) => membership.status === 'approved');
    return {
      memberships,
      approved,
      activeSponsor:
        approved.find((membership) => membership.sponsor.id === data?.active_sponsor_id) ?? null,
      loaded: Boolean(data),
      status,
      error,
      reload,
      setData,
      switchSponsor,
      scopeKey,
    };
  }, [data, status, error, reload, setData, switchSponsor, scopeKey]);

  return <ActiveSponsorContext.Provider value={value}>{children}</ActiveSponsorContext.Provider>;
}

/** The driver's sponsors, or null outside a driver's app shell. */
export function useActiveSponsor() {
  return useContext(ActiveSponsorContext);
}
