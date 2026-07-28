import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isLocale } from "@/lib/strings";
import { UnsubscribeClient } from "./UnsubscribeClient";

export const metadata: Metadata = { referrer: "no-referrer" };

export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  const locale = typeof query.lang === "string" && isLocale(query.lang) ? query.lang : "en";
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.rpc("validate_email_unsubscribe_token", { p_token: token });
  const validation = error ? "failure" : data === true ? "valid" : "invalid";
  return <UnsubscribeClient locale={locale} validation={validation} />;
}
