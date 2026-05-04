import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useIdleSessionSignOut } from "../hooks/useIdleSessionSignOut";

type AuthState = {
  session: Session | null;
  user: User | null;
  permissions: string[];
  loading: boolean;
  refreshPermissions: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_permissions");
    if (error) {
      console.error("get_my_permissions", error);
      setPermissions([]);
      return;
    }
    setPermissions(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);
      if (s) void loadPermissions();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) void loadPermissions();
      else setPermissions([]);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [loadPermissions]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setPermissions([]);
  }, []);

  useIdleSessionSignOut(Boolean(session) && isSupabaseConfigured, signOut);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      permissions,
      loading,
      refreshPermissions: loadPermissions,
      signOut,
    }),
    [session, permissions, loading, loadPermissions, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth dentro de AuthProvider");
  return ctx;
}
