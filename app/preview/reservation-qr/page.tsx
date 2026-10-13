import { notFound } from "next/navigation";
import { ReservationQr } from "@/components/ReservationQr";
import { renderLaunchQr, type LaunchArrivalQr } from "@/lib/launch-qr";
import { isLocale } from "@/lib/strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reservation QR preview", robots: { index: false, follow: false } };

// Synthetic presentation fixture only. No shared reservation, payment or secret
// is read or created. This route is unavailable in production and local servers.
export default async function ReservationQrPreview({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const params = await searchParams;
  const locale = params.locale ?? "en";
  const state = params.state ?? "ready";
  if (typeof locale !== "string" || !isLocale(locale) ||
    (state !== "ready" && state !== "verified") ||
    Object.keys(params).some(key => key !== "locale" && key !== "state")) notFound();
  const qr: LaunchArrivalQr = {
    reservation_id: "12345678-1234-1234-1234-123456789abc",
    night_id: "12345678-1234-1234-1234-123456789def",
    starts_at: "2026-10-20T18:00:00Z", ends_at: "2026-10-20T22:00:00Z", timezone: "Europe/Paris",
    verified_at: state === "verified" ? "2026-10-20T20:00:00Z" : null,
    png_data_url: `data:image/png;base64,${(await renderLaunchQr("1860".repeat(16))).toString("base64")}`,
  };
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">
      <p className="mb-6 text-center text-xs text-taupe">Preview · Synthetic reservation</p>
      <div lang={locale}><ReservationQr qr={qr} locale={locale} /></div>
    </main>
  );
}
