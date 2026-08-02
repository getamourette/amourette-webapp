import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function createEmailPreferenceLinks(
  service: SupabaseClient<Database>,
  email: string
) {
  const { data: token, error } = await service.rpc("issue_email_unsubscribe_token", { p_email: email });
  if (error || !token) throw error ?? new Error("Could not issue unsubscribe token");
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://getamourette.com";
  const unsubscribeUrl = `${origin.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
  const oneClickUrl = `${origin.replace(/\/$/, "")}/api/unsubscribe/one-click?token=${encodeURIComponent(token)}`;
  return {
    preferencesUrl: unsubscribeUrl,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
