import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { LandingNavbar } from "./LandingNavbar";
import { LandingFooter } from "./LandingFooter";

export function LandingLayout() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!loading && session) nav("/dashboard", { replace: true });
  }, [loading, session, nav]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  if (loading || session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] text-[var(--muted)]">
        <span className="jif-caps text-sm tracking-wider">Cargando…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--background)] text-[var(--foreground)]">
      <LandingNavbar />
      <div className="flex-1">
        <Outlet />
      </div>
      <LandingFooter />
    </div>
  );
}
