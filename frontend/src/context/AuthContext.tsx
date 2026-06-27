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
  // True when admin is currently viewing the app as a técnico.
  isImpersonating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  impersonateTecnico: (tecnicoId: string) => Promise<AuthUser>;
  endImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const STORAGE_ADMIN_BACKUP_TOKEN = "mvg_admin_backup_token";
const STORAGE_ADMIN_BACKUP_USER = "mvg_admin_backup_user";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await storage.secureGet<string>("mvg_token", "");
      const u = await storage.getItem<string>("mvg_user", "");
      const adminBackup = await storage.secureGet<string>(STORAGE_ADMIN_BACKUP_TOKEN, "");
      if (t && u) {
        try {
          setToken(t);
          setAuthToken(t);
          setUser(JSON.parse(u));
          setIsImpersonating(!!adminBackup);
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
    setIsImpersonating(false);
    await storage.secureSet("mvg_token", access_token);
    await storage.setItem("mvg_user", JSON.stringify(u));
    // Clean any leftover impersonation backup
    await storage.secureRemove(STORAGE_ADMIN_BACKUP_TOKEN);
    await storage.removeItem(STORAGE_ADMIN_BACKUP_USER);
  }, []);

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    setAuthToken(null);
    setIsImpersonating(false);
    await storage.secureRemove("mvg_token");
    await storage.removeItem("mvg_user");
    await storage.secureRemove(STORAGE_ADMIN_BACKUP_TOKEN);
    await storage.removeItem(STORAGE_ADMIN_BACKUP_USER);
  }, []);

  const impersonateTecnico = useCallback(
    async (tecnicoId: string): Promise<AuthUser> => {
      const r = await api.post(`/admin/tecnicos/${tecnicoId}/impersonate`);
      const { access_token, tecnico } = r.data;
      // Backup admin session BEFORE swapping
      if (token && user && user.role === "admin") {
        await storage.secureSet(STORAGE_ADMIN_BACKUP_TOKEN, token);
        await storage.setItem(STORAGE_ADMIN_BACKUP_USER, JSON.stringify(user));
      }
      // Swap to técnico
      setToken(access_token);
      setAuthToken(access_token);
      setUser(tecnico);
      setIsImpersonating(true);
      await storage.secureSet("mvg_token", access_token);
      await storage.setItem("mvg_user", JSON.stringify(tecnico));
      return tecnico;
    },
    [token, user]
  );

  const endImpersonation = useCallback(async () => {
    const backupToken = await storage.secureGet<string>(STORAGE_ADMIN_BACKUP_TOKEN, "");
    const backupUserStr = await storage.getItem<string>(STORAGE_ADMIN_BACKUP_USER, "");
    if (!backupToken || !backupUserStr) {
      // No backup → just logout to be safe
      await logout();
      return;
    }
    try {
      const adminUser = JSON.parse(backupUserStr);
      setToken(backupToken);
      setAuthToken(backupToken);
      setUser(adminUser);
      setIsImpersonating(false);
      await storage.secureSet("mvg_token", backupToken);
      await storage.setItem("mvg_user", backupUserStr);
      await storage.secureRemove(STORAGE_ADMIN_BACKUP_TOKEN);
      await storage.removeItem(STORAGE_ADMIN_BACKUP_USER);
    } catch {
      await logout();
    }
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isImpersonating,
        login,
        logout,
        impersonateTecnico,
        endImpersonation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
