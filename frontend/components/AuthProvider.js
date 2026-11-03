"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const refresh = useCallback(() => {
    return api("/api/v1/auth/me")
      .then((result) => {
        setUser(result.data.user);
        return result.data.user;
      })
      .catch(() => {
        setUser(null);
        return null;
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api("/api/v1/auth/me")
      .then((result) => {
        if (!cancelled) setUser(result.data.user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await api("/api/v1/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading: user === undefined, refresh, logout }), [user, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
