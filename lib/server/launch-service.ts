import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@/lib/database.types";
import { openCredential } from "./launch-secrets";
import type { LaunchRpc } from "@/lib/server/launch-engine";
import { launchAddressKey } from "@/lib/launch-contract";
export { launchProvider } from "@/lib/server/launch-provider";

export function launchRpc(): LaunchRpc {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  return async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data as never;
  };
}
export function launchOrigin(): string {
  const raw = process.env.LAUNCH_SITE_ORIGIN;
  if (!raw) throw new Error("launch_origin_unconfigured");
  const url = new URL(raw);
  if (url.origin !== raw || (url.protocol !== "https:" && !["http://localhost:3000", "http://127.0.0.1:3000"].includes(raw))) {
    throw new Error("invalid_launch_origin");
  }
  return raw;
}
export function privateJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff" } });
}
function launchSecretKey(): string {
  const key = process.env.LAUNCH_SECRET_KEY;
  if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new Error("launch_key_unconfigured");
  return key;
}
// Vercel overwrites this header. Other hosts share a conservative bucket;
// arbitrary X-Forwarded-For values never bypass address budgets.
function launchAddress(request: Request): string {
  return process.env.VERCEL === "1" ? launchAddressKey(request.headers.get("x-vercel-forwarded-for")?.slice(0, 256) ?? "unknown") : "local";
}
// Identifies the request source for the unpaid-hold cap (#365) without storing the address.
export function launchHoldSource(request: Request): string {
  return createHmac("sha256", launchSecretKey()).update(`launch-hold:${launchAddress(request)}`).digest("hex");
}
// One budget per purpose and address, so guests who share an address do not spend
// each other's allowance across unrelated actions (#400). `manage` is the fallback
// for a missing or invalid capability on a credential route.
export type LaunchRatePurpose = "availability" | "create" | "recovery" | "exchange" | "waitlist" | "manage";
// With `credentialScoped`, a valid access capability gets its own budget instead.
// Never pass it for creation: an email collision does not consume the capability (#350).
export async function allowLaunchRequest(request: Request, rpc: LaunchRpc, purpose: LaunchRatePurpose, credentialScoped = false): Promise<boolean> {
  if (request.method !== "GET" && (request.headers.get("origin") !== launchOrigin() ||
    request.headers.get("sec-fetch-site") === "cross-site" ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json")) return false;
  const key = launchSecretKey(), address = launchAddress(request);
  let scope = `launch-${purpose}`;
  if (credentialScoped) {
    try {
      const credential = openCredential(request.headers.get("authorization")?.replace(/^Bearer /, ""), "access");
      scope = `launch-manage:${credential.id}`;
    } catch { /* Invalid capabilities share the conservative per-purpose address bucket. */ }
  }
  const bucket = createHmac("sha256", key).update(`${scope}:${address}`).digest("hex");
  return rpc("launch_http_allow", { p_bucket: bucket });
}
export function workerAuthorized(request: Request): boolean {
  const expected = process.env.LAUNCH_WORKER_SECRET;
  const actual = request.headers.get("authorization");
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || !actual) return false;
  const wanted = Buffer.from(`Bearer ${expected}`), supplied = Buffer.from(actual);
  return wanted.length === supplied.length && timingSafeEqual(wanted, supplied);
}
