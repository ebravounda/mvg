import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

export type Role = "admin" | "tecnico";

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  apellidos: string;
  role: Role;
  rut?: string;
  telefono?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = await storage.secureGet<string>("mvg_token", "");
      const u = await storage.getItem<string>("mvg_user", "");
      if (t && u) {
        try {
          setToken(t);
          setAuthToken(t);
          setUser(JSON.parse(u));
        } catch {
          await storage.secureRemove("mvg_token");
          await storage.removeItem("mvg_user");
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    const { access_token, user: u } = res.data;
    setToken(access_token);
    setAuthToken(access_token);
    setUser(u);
    await storage.secureSet("mvg_token", access_token);
    await storage.setItem("mvg_user", JSON.stringify(u));
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    await storage.secureRemove("mvg_token");
    await storage.removeItem("mvg_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
