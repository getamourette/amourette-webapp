/** @jsxImportSource react */
import type { LaunchArrivalQr } from "@/lib/launch-qr";
import { launchQrStrings } from "@/lib/launch-qr-strings";
import type { Locale } from "@/lib/strings";

// #184 supplies the authorized response and handles loading/unavailable states.
// A saved image cannot reflect a later cancellation; staff always recheck online.
export function ReservationQr({ qr, locale }: { qr: LaunchArrivalQr; locale: Locale }) {
  const text = launchQrStrings[locale];
  return (
    <figure className="mx-auto w-full max-w-sm space-y-4 text-center">
      <figcaption className="space-y-2">
        <p className="text-lg font-semibold">{text.title}</p>
        <p className="text-sm">{qr.verified_at ? text.verified : text.instructions}</p>
      </figcaption>
      {/* Keep this private inline image out of the Next.js image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr.png_data_url} alt={text.alt} width={328} height={328}
        className="mx-auto h-auto w-full max-w-[328px] bg-white" />
      <p className="text-sm">
        {text.reference}<br />
        <span className="break-all font-mono text-xs">{qr.reservation_id}</span>
      </p>
      <p className="text-sm">{text.fallback}</p>
    </figure>
  );
}
