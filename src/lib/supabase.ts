import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

/** Sesión por pestaña: al cerrar la pestaña el usuario debe volver a iniciar sesión. */
const authStorage =
  typeof globalThis !== "undefined" && "sessionStorage" in globalThis
    ? globalThis.sessionStorage
    : undefined;

export const supabase = createClient(url ?? "", key ?? "", {
  auth: {
    persistSession: Boolean(authStorage),
    storage: authStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
