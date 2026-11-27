import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Link-preview image for every page (#277): the approved vertical signature in
// cream on the velvet app ground (docs/brand/logo/v1), nothing about a venue or a
// night. Generated once at build time.
export const alt = "Amourette logo, cream on a dark velvet background";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/brand/amourette-vertical-cream.svg"));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#120a0f" }}>
        <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={824} height={360} alt="" />
      </div>
    ),
    size,
  );
}
