import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();

  if (!isSupabaseConfigured) {
    return <div className="p-8 text-center text-[var(--muted)]">Configurá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-[var(--muted)]">
        Cargando sesión…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  return <>{children}</>;
}
