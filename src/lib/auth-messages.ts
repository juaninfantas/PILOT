import type { AuthError } from "@supabase/supabase-js";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Tenés que confirmar tu correo antes de iniciar sesión.",
  "User already registered": "Ya existe una cuenta con ese correo. Iniciá sesión o recuperá la contraseña.",
  "Signup requires a valid password": "La contraseña no cumple los requisitos mínimos.",
  "Password should be at least 6 characters": "La contraseña debe tener al menos 6 caracteres.",
};

export function isEmailNotConfirmedError(error: Pick<AuthError, "message" | "code">): boolean {
  if (error.code === "email_not_confirmed") return true;
  return /email not confirmed/i.test(error.message);
}

export function formatAuthError(error: Pick<AuthError, "message">): string {
  const trimmed = error.message.trim();
  return AUTH_ERROR_MESSAGES[trimmed] ?? trimmed;
}

export const EMAIL_NOT_CONFIRMED_HINT =
  "Revisá tu bandeja de entrada (y la carpeta de spam). Abrí el enlace del correo de confirmación y volvé a iniciar sesión.";
