import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import * as api from '../config/api';

const AuthContext = createContext(null);

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
    const user = await api.login(username, password);
    setState({ loading: false, user });
    return user;
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setState({ loading: false, user: null });
  }, []);

  return <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}