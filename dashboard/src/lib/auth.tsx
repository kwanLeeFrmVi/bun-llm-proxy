import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, type LoginResponse } from "./api.ts";

export type UserRole = 'admin' | 'user';

interface AuthContextValue {
  token: string | null;
  username: string | null;
  userId: string | null;
  role: UserRole | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("auth_token"),
  );
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem("auth_username"),
  );
  const [userId, setUserId] = useState<string | null>(() =>
    localStorage.getItem("auth_user_id"),
  );
  const [role, setRole] = useState<UserRole | null>(() =>
    (localStorage.getItem("auth_role") as UserRole | null),
  );
  const [loading, setLoading] = useState(false);

  // On mount, refresh role from /me if we have a token but role is missing
  useEffect(() => {
    if (token && !role) {
      api.auth.me().then(res => {
        localStorage.setItem("auth_role", res.role);
        localStorage.setItem("auth_user_id", res.id);
        setRole(res.role);
        setUserId(res.id);
      }).catch(() => {});
    }
  }, [token, role]);

  const login = useCallback(async (u: string, p: string) => {
    setLoading(true);
    try {
      const res: LoginResponse = await api.auth.login(u, p);
      localStorage.setItem("auth_token", res.token);
      localStorage.setItem("auth_username", res.username);
      localStorage.setItem("auth_role", res.role);
      localStorage.setItem("auth_user_id", res.userId);
      setToken(res.token);
      setUsername(res.username);
      setRole(res.role);
      setUserId(res.userId);

      window.location.href = "/";
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.auth.logout().catch(() => {});
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_username");
    localStorage.removeItem("auth_role");
    localStorage.removeItem("auth_user_id");
    setToken(null);
    setUsername(null);
    setRole(null);
    setUserId(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, userId, role, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
