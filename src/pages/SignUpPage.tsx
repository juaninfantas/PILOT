import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { formatAuthError } from "../lib/auth-messages";
import { completeOrganizationJoin } from "../lib/completeOrganizationJoin";
import { setStoredOrgSlug } from "../lib/orgSlugStorage";

export function SignUpPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { session, loading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgSlug, setOrgSlug] = useState(searchParams.get("org") ?? "");
  const [inviteCode, setInviteCode] = useState(searchParams.get("invite") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) nav("/dashboard", { replace: true });
  }, [loading, session, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const slugNorm = orgSlug.trim().toLowerCase();
    if (!slugNorm) {
      setError("Indicá la inmobiliaria a la que te unís.");
      return;
    }
    if (!inviteCode.trim()) {
      setError("Necesitás el código de invitación que te proporciona la administración.");
      return;
    }
    setPending(true);
    const fn = firstName.trim();
    const ln = lastName.trim();
    const display = [fn, ln].filter(Boolean).join(" ");

    const inviteNorm = inviteCode.trim();
    const emailNorm = email.trim().toLowerCase();

    const { error: claimErr } = await supabase.rpc("claim_organization_invite_for_signup", {
      p_slug: slugNorm,
      p_invite: inviteNorm,
      p_email: emailNorm,
    });
    if (claimErr) {
      setPending(false);
      setError(claimErr.message);
      return;
    }

    const { data: signUpData, error: signErr } = await supabase.auth.signUp({
      email: emailNorm,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          first_name: fn,
          last_name: ln,
          full_name: display || undefined,
        },
      },
    });
    if (signErr) {
      await supabase.rpc("release_organization_invite_claim", {
        p_slug: slugNorm,
        p_email: emailNorm,
      });
      setPending(false);
      setError(formatAuthError(signErr));
      return;
    }
    if (!signUpData.session) {
      setStoredOrgSlug(slugNorm);
      setPending(false);
      setSuccess(
        "¡Registro exitoso! Revisá tu correo, confirmá tu cuenta con el enlace que te enviamos y después iniciá sesión con las mismas credenciales.",
      );
      return;
    }

    const join = await completeOrganizationJoin(slugNorm);
    if (!join.ok) {
      setPending(false);
      setError(
        join.error +
          ". Si la cuenta fue creada pero falló la inmobiliaria, contactá al administrador (no vuelvas a registrarte).",
      );
      return;
    }

    setPending(false);
    nav("/dashboard", { replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-[var(--background)] p-4">
      <Link to="/" className="block text-center outline-offset-2 hover:opacity-90">
        <span className="font-pilot-logo block text-[clamp(3rem,10vw,4.5rem)] leading-none text-[var(--foreground)]">
          Pilot.
        </span>
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription className="text-[var(--muted)]">Sólo con código de invitación válido.</CardDescription>
        </CardHeader>
        {success ? (
          <div className="space-y-4">
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">{success}</p>
            <Link
              to="/login"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] hover:brightness-110"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="first">Nombre</Label>
                <Input id="first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="last">Apellido</Label>
                <Input id="last" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="org">Inmobiliaria</Label>
              <Input
                id="org"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                placeholder="ej: miinmobiliaria"
                required
                readOnly={!!searchParams.get("org")}
                className={searchParams.get("org") ? "bg-[var(--background)] opacity-70" : ""}
              />
              {searchParams.get("org") ? (
                <p className="mt-1 text-xs text-[var(--muted)]">Pre-cargado desde tu enlace de invitación.</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="invite">Código de invitación</Label>
              <Input
                id="invite"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="ej: PIL-XXXXXXXXXX"
                required
                readOnly={!!searchParams.get("invite")}
                className={searchParams.get("invite") ? "bg-[var(--background)] font-mono opacity-70" : ""}
              />
              {searchParams.get("invite") ? (
                <p className="mt-1 text-xs text-[var(--muted)]">Pre-cargado desde tu enlace de invitación.</p>
              ) : (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Lo proporciona el administrador. Es de <strong>un solo uso</strong>.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creando…" : "Registrarme"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          ¿Ya tenés cuenta?{" "}
          <Link to="/login" className="text-[var(--accent)] hover:underline">
            Iniciar sesión
          </Link>
          {" · "}
          <Link to="/" className="hover:underline">
            Inicio
          </Link>
        </p>
      </Card>
    </div>
  );
}
