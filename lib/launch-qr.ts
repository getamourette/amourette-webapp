import QRCode from "qrcode";

export type LaunchArrivalQr = {
  reservation_id: string;
  night_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  verified_at: string | null;
  png_data_url: string;
};

// A fixed byte-mode payload preserves the exact secret, including numeric-only
// tokens. Four white modules surround the symbol; no logos or transparent pixels.
export async function renderLaunchQr(secret: string): Promise<Buffer> {
  if (typeof secret !== "string" || secret.length !== 64 || !/^[a-f0-9]{64}$/.test(secret)) throw new Error("invalid_arrival_code");
  return QRCode.toBuffer([{ data: Buffer.from(secret, "ascii"), mode: "byte" }], {
    type: "png", errorCorrectionLevel: "M", margin: 4, scale: 8,
    color: { dark: "#000000ff", light: "#ffffffff" },
  });
}
