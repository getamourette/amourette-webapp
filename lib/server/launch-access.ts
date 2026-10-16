import { randomBytes } from "node:crypto";
import type { LaunchRpc } from "./launch-engine";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid } from "../input-validation.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { openCredential, sealCredential } from "./launch-secrets.ts";

export async function exchangeAccess(rpc: LaunchRpc, id: string, token: string) {
  const proof = await rpc("inspect_launch_access", { p_id: id, p_token: token });
  if (!isRecord(proof) || !isUuid(proof.reservation_id) || typeof proof.envelope !== "string") throw new Error("invalid_access");
  const original = openCredential(proof.envelope, "delivery");
  if (original.id !== proof.reservation_id) throw new Error("invalid_access");
  const renewed = { ...original, management: randomBytes(32).toString("hex"), issued: Date.now() };
  const result = await rpc("exchange_launch_access", { p_id: id, p_token: token, p_previous: proof.envelope,
    p_management: renewed.management, p_arrival: original.arrival, p_envelope: sealCredential(renewed, "delivery") });
  if (!isRecord(result) || result.reservation_id !== original.id) throw new Error("invalid_access");
  const actual = openCredential(result.envelope, "delivery");
  if (actual.id !== original.id) throw new Error("invalid_access");
  const access = sealCredential(actual, "access");
  openCredential(access, "access");
  return { id: actual.id, access };
}
