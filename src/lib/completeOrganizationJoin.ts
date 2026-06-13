import { supabase } from "./supabase";
import { setStoredOrgSlug } from "./orgSlugStorage";

type JoinResult = { ok: true } | { ok: false; error: string };

export async function completeOrganizationJoin(slug: string): Promise<JoinResult> {
  const slugNorm = slug.trim().toLowerCase();
  if (!slugNorm) {
    return { ok: false, error: "Ingresá el identificador de la inmobiliaria (slug)." };
  }

  const { data: matches, error: assertErr } = await supabase.rpc("assert_organization_slug_matches_membership", {
    p_slug: slugNorm,
  });
  if (assertErr) return { ok: false, error: assertErr.message };
  if (matches) {
    setStoredOrgSlug(slugNorm);
    return { ok: true };
  }

  const { error: finalizeErr } = await supabase.rpc("finalize_organization_membership_from_signup", {
    p_slug: slugNorm,
  });
  if (finalizeErr) return { ok: false, error: finalizeErr.message };

  const { data: matchesAfter, error: assertErr2 } = await supabase.rpc("assert_organization_slug_matches_membership", {
    p_slug: slugNorm,
  });
  if (assertErr2) return { ok: false, error: assertErr2.message };
  if (!matchesAfter) {
    return { ok: false, error: "No pertenecés a esta inmobiliaria o el slug no coincide." };
  }

  setStoredOrgSlug(slugNorm);
  return { ok: true };
}
