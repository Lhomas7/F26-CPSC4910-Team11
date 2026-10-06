import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import * as api from '../api';

const AuthContext = createContext(null);

// `session` (device check, idle timeout) describes the sign-in, not the profile.
// Profile and view-as responses omit it, so carry the current one over.
function keepSession(previous, next) {
  if (!next || next.session !== undefined || !previous?.session) return next;
  return { ...next, session: previous.session };
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    let active = true;
    api.ensureCsrf()
      .then(() => api.me())
      .then((data) => {
        if (!active) return;
        setState({ loading: false, user: data.authenticated ? data.user : null });
      })
      .catch(() => {
        if (!active) return;
        setState({ loading: false, user: null });
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (username, password) => {
    const result = await api.login(username, password);
    if (result && result.mfa && result.mfa.enrolled) {
      // Staged MFA challenge — no authenticated session yet.
      return { mfa: result.mfa };
    }
    setState({ loading: false, user: result });
    return result;
  }, []);

  const completeMfaLogin = useCallback(async (method, code) => {
    const user = await api.loginMfa(method, code);
    setState({ loading: false, user });
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
      setState({ loading: false, user: null });
    }
  }, []);

  const updateUser = useCallback((user) => {
    setState((current) => ({ loading: false, user: keepSession(current.user, user) }));
  }, []);

  const answerDeviceCheck = useCallback(async (trusted) => {
    const { session } = await api.deviceCheck(trusted);
    setState((current) => ({
      loading: false,
      user: current.user && { ...current.user, session },
    }));
  }, []);

  const startImpersonation = useCallback(async (userId) => {
    const user = await api.startAdminImpersonation(userId);
    setState((current) => ({ loading: false, user: keepSession(current.user, user) }));
    return user;
  }, []);

  const stopImpersonation = useCallback(async () => {
    const user = await api.stopAdminImpersonation();
    setState((current) => ({ loading: false, user: keepSession(current.user, user) }));
    return user;
  }, []);

  return (
    <AuthContext.Provider value={{
      ...state,
      signIn,
      completeMfaLogin,
      requestMfaLoginCode,
      signOut,
      updateUser,
      answerDeviceCheck,
      startImpersonation,
      stopImpersonation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
