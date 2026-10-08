import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import * as api from '../api';
import { API_ACTIVITY_EVENT, SESSION_EXPIRED_EVENT } from './sessionEvents';

const AuthContext = createContext(null);

// `session` (device check, idle timeout) describes the sign-in, not the profile.
// Profile and view-as responses omit it, so carry the current one over.
function keepSession(previous, next) {
  if (!next || next.session !== undefined || !previous?.session) return next;
  return { ...next, session: previous.session };
}

export function AuthProvider({ children }) {
  // notice: 'expired' after the session timed out, so the sign-in page can say why.
  const [state, setState] = useState({ loading: true, user: null, notice: null });

  useEffect(() => {
    let active = true;
    api
      .ensureCsrf()
      .then(() => api.me())
      .then((data) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          loading: false,
          user: data.authenticated ? data.user : null,
        }));
      })
      .catch(() => {
        if (!active) return;
        // Keep a notice set by SESSION_EXPIRED_EVENT during this same request.
        setState((current) => ({ ...current, loading: false, user: null }));
      });
    return () => {
      active = false;
    };
  }, []);

  // The server ended the session (idle or absolute limit).
  useEffect(() => {
    const onExpired = () => setState({ loading: false, user: null, notice: 'expired' });
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Mirror the server's idle limit so an unattended screen clears itself
  // instead of leaving account data visible. Only API requests reset it,
  // because only requests reset the server's clock.
  const idleTimeoutSeconds = state.user?.session?.idle_timeout_seconds;
  useEffect(() => {
    if (!idleTimeoutSeconds) return undefined;
    let timer;
    const expire = () => {
      window.removeEventListener(API_ACTIVITY_EVENT, restart);
      setState({ loading: false, user: null, notice: 'expired' });
      api.logout().catch(() => {});
    };
    function restart() {
      clearTimeout(timer);
      timer = setTimeout(expire, idleTimeoutSeconds * 1000);
    }
    restart();
    window.addEventListener(API_ACTIVITY_EVENT, restart);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(API_ACTIVITY_EVENT, restart);
    };
  }, [idleTimeoutSeconds]);

  const signIn = useCallback(async (username, password) => {
    const result = await api.login(username, password);
    if (result && result.mfa && result.mfa.enrolled) {
      // Staged MFA challenge — no authenticated session yet.
      return { mfa: result.mfa };
    }
    setState({ loading: false, user: result, notice: null });
    return result;
  }, []);

  const completeMfaLogin = useCallback(async (method, code) => {
    const user = await api.loginMfa(method, code);
    setState({ loading: false, user, notice: null });
    return user;
  }, []);

  const requestMfaLoginCode = useCallback(async (method) => {
    await api.loginMfaRequestCode(method);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Still drop the signed-in view if the request fails; leaving the account
      // on screen would invite the next person at this device to keep using it.
    } finally {
      setState({ loading: false, user: null, notice: null });
    }
  }, []);

  const updateUser = useCallback((user) => {
    setState((current) => ({ ...current, loading: false, user: keepSession(current.user, user) }));
  }, []);

  const answerDeviceCheck = useCallback(async (trusted) => {
    const { session } = await api.deviceCheck(trusted);
    setState((current) => ({
      ...current,
      loading: false,
      user: current.user && { ...current.user, session },
    }));
  }, []);

  const startImpersonation = useCallback(async (userId) => {
    const user = await api.startAdminImpersonation(userId);
    setState((current) => ({ ...current, loading: false, user: keepSession(current.user, user) }));
    return user;
  }, []);

  const stopImpersonation = useCallback(async () => {
    const user = await api.stopAdminImpersonation();
    setState((current) => ({ ...current, loading: false, user: keepSession(current.user, user) }));
    return user;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signIn,
        completeMfaLogin,
        requestMfaLoginCode,
        signOut,
        updateUser,
        answerDeviceCheck,
        startImpersonation,
        stopImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
