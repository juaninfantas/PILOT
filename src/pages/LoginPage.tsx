import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { completeOrganizationJoin } from "../lib/completeOrganizationJoin";
import { getStoredOrgSlug } from "../lib/orgSlugStorage";
import { EMAIL_NOT_CONFIRMED_HINT, formatAuthError, isEmailNotConfirmedError } from "../lib/auth-messages";

export function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgSlug, setOrgSlug] = useState(() => getStoredOrgSlug());
  const [error, setError] = useState<string | null>(null);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailNotConfirmed(false);
    setResendMsg(null);
    const slugNorm = orgSlug.trim().toLowerCase();
    if (!slugNorm) {
      setError("Ingresá el identificador de la inmobiliaria (slug).");
      return;
    }
    setPending(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setPending(false);
      if (isEmailNotConfirmedError(err)) {
        setEmailNotConfirmed(true);
        setError(formatAuthError(err));
      } else {
        setError(formatAuthError(err));
      }
      return;
    }
    const join = await completeOrganizationJoin(slugNorm);
    setPending(false);
    if (!join.ok) {
      await supabase.auth.signOut();
      setError(join.error);
      return;
    }
    nav(loc.state?.from ?? "/dashboard", { replace: true });
  }

  async function resendConfirmation() {
    setResendMsg(null);
    const emailNorm = email.trim();
    if (!emailNorm) {
      setResendMsg("Ingresá tu correo arriba para reenviar la confirmación.");
      return;
    }
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email: emailNorm,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (resendErr) {
      setResendMsg(formatAuthError(resendErr));
      return;
    }
    setResendMsg("Te reenviamos el correo de confirmación. Revisá tu bandeja.");
  }

  useEffect(() => {
    if (!loading && session) nav("/dashboard", { replace: true });
  }, [loading, session, nav]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-[var(--background)] p-4">
      <Link to="/" className="block text-center outline-offset-2 hover:opacity-90">
        <span className="font-pilot-logo block text-[clamp(3rem,10vw,4.5rem)] leading-none text-[var(--foreground)]">
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
          {emailNotConfirmed ? (
            <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p className="font-medium">{error}</p>
              <p>{EMAIL_NOT_CONFIRMED_HINT}</p>
              <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => void resendConfirmation()}>
                Reenviar correo de confirmación
              </Button>
              {resendMsg ? <p className="text-xs">{resendMsg}</p> : null}
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : null}
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
