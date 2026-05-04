import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { setStoredOrgSlug } from "../lib/orgSlugStorage";

export function SignUpPage() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && session) nav("/dashboard", { replace: true });
  }, [loading, session, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const slugNorm = orgSlug.trim().toLowerCase();
    if (!slugNorm) {
      setError("Definí la inmobiliaria (slug).");
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

    const { data: signUpData, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: fn,
          last_name: ln,
          full_name: display || undefined,
        },
      },
    });
    if (signErr) {
      setPending(false);
      setError(signErr.message);
      return;
    }
    if (!signUpData.session) {
      setPending(false);
      setError(
        "Tenés que confirmar el email antes de vincular la inmobiliaria. Después iniciá sesión con el mismo slug y credenciales.",
      );
      return;
    }

    const { error: attachErr } = await supabase.rpc("attach_organization_membership", {
      p_slug: slugNorm,
      p_invite: inviteCode.trim(),
    });
    if (attachErr) {
      setPending(false);
      setError(
        attachErr.message +
          ". Si la cuenta fue creada pero falló la inmobiliaria, contactá al administrador (no vuelvas a registrarte).",
      );
      return;
    }

    setStoredOrgSlug(slugNorm);
    setPending(false);
    nav("/dashboard", { replace: true });
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--background)] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>
            <span className="font-pilot-logo text-2xl text-[var(--foreground)]">Pilot.</span>
            <span className="block pt-2 text-sm text-[var(--muted)]">Sólo con código de invitación válido.</span>
          </CardDescription>
        </CardHeader>
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
            <Label htmlFor="slug">Slug inmobiliaria</Label>
            <Input id="slug" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} placeholder="ej: default" required />
          </div>
          <div>
            <Label htmlFor="invite">Código de invitación</Label>
            <Input id="invite" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Lo indicó un administrador en Administración → MyPilot. Es de <strong>un solo uso</strong>; podés pegarlo con el formato que sea.
            </p>
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
