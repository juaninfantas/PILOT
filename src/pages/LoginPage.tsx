import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { getStoredOrgSlug, setStoredOrgSlug } from "../lib/orgSlugStorage";

export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgSlug, setOrgSlug] = useState(() => getStoredOrgSlug());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const slugNorm = orgSlug.trim().toLowerCase();
    if (!slugNorm) {
      setError("Ingresá el identificador de la inmobiliaria (slug).");
      return;
    }
    setPending(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setPending(false);
      setError(err.message);
      return;
    }
    const { data: ok, error: rerr } = await supabase.rpc("assert_organization_slug_matches_membership", {
      p_slug: slugNorm,
    });
    setPending(false);
    if (rerr) {
      await supabase.auth.signOut();
      setError(rerr.message);
      return;
    }
    if (!ok) {
      await supabase.auth.signOut();
      setError("No pertenecés a esta inmobiliaria o el slug no coincide.");
      return;
    }
    setStoredOrgSlug(slugNorm);
    nav(loc.state?.from ?? "/dashboard", { replace: true });
  }

  useEffect(() => {
    if (!loading && session) nav("/dashboard", { replace: true });
  }, [loading, session, nav]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-[var(--background)] p-4">
      <Link to="/" className="text-center hover:opacity-90">
        <p className="jif-caps text-[0.65rem] tracking-[0.3em] text-[var(--muted)]">Pilot</p>
        <span className="font-pilot-logo mt-2 block text-[clamp(3rem,12vw,5rem)] leading-[0.9] text-[var(--foreground)]">
          Pilot.
        </span>
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription className="text-[var(--muted)]">Correo, contraseña e identificador de tu inmobiliaria.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="org_slug">Inmobiliaria</Label>
            <Input
              id="org_slug"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="ej: default"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value.trim().toLowerCase())}
              required
            />
            <p className="mt-1 text-xs text-[var(--muted)]">Slug único sin espacios ni mayúsculas.</p>
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          ¿No tenés cuenta?{" "}
          <Link to="/sign-up" className="text-[var(--accent)] hover:underline">
            Registrate
          </Link>
          {" · "}
          <Link to="/" className="hover:underline">
            Volver al inicio
          </Link>
        </p>
      </Card>
    </div>
  );
}
