import type { LaunchRpc } from "./launch-engine";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid } from "../input-validation.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { openCredential } from "./launch-secrets.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { renderLaunchQr, type LaunchArrivalQr } from "../launch-qr.ts";

// Server-only consumers: the guest HTTP facade and the future #189 email worker.
// Never return the encrypted delivery envelope or its management secret to a guest.
async function renderDelivery(value: unknown, expectedId: string) {
  if (!isRecord(value) || value.reservation_id !== expectedId || !isUuid(value.night_id) ||
    typeof value.recipient_email !== "string" ||
    (value.locale !== "en" && value.locale !== "fr" && value.locale !== "es") ||
    typeof value.timezone !== "string" || typeof value.starts_at !== "string" || typeof value.ends_at !== "string" ||
    !Number.isFinite(Date.parse(value.starts_at)) || !Number.isFinite(Date.parse(value.ends_at)) ||
    !(value.verified_at === null || (typeof value.verified_at === "string" && Number.isFinite(Date.parse(value.verified_at))))) {
    throw new Error("arrival_delivery_unavailable");
  }
  const credential = openCredential(value.envelope, "delivery");
  if (credential.id !== expectedId) throw new Error("arrival_delivery_unavailable");
  const png = await renderLaunchQr(credential.arrival);
  const metadata = {
    reservation_id: expectedId, night_id: value.night_id,
    starts_at: value.starts_at, ends_at: value.ends_at, timezone: value.timezone,
    verified_at: value.verified_at,
  };
  return { metadata, png, recipient: value.recipient_email, locale: value.locale };
}

export async function getLaunchArrivalQr(rpc: LaunchRpc, id: string, management: string): Promise<LaunchArrivalQr> {
  const value = await rpc("get_launch_arrival_delivery", { p_id: id, p_secret: management });
  const { metadata, png } = await renderDelivery(value, id);
  return { ...metadata, png_data_url: `data:image/png;base64,${png.toString("base64")}` };
}

// Attach the PNG inline with a CID chosen by the email template. No public image
// URL, QR service, browser capability lifetime, or caller-supplied recipient.
export async function getLaunchArrivalEmailAsset(rpc: LaunchRpc, id: string) {
  const value = await rpc("read_launch_arrival_delivery", { p_id: id });
  const { metadata, png, recipient, locale } = await renderDelivery(value, id);
  return { ...metadata, recipient, locale, content: png, contentType: "image/png" as const, filename: "reservation-qr.png" };
}
