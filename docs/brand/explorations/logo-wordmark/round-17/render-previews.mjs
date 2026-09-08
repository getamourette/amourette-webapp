import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { candidates, iconSvg } from "./artwork.mjs";

const output = new URL("./previews/", import.meta.url);
await mkdir(output, { recursive: true });
for (const candidate of candidates) {
  const source = await readFile(new URL(candidate.file, import.meta.url), "utf8");
  for (const size of [16, 32, 64]) {
    await sharp(Buffer.from(iconSvg(source))).resize(size, size).png()
      .toFile(new URL(`${candidate.id}-${size}.png`, output).pathname);
  }
}
console.log("Rendered nine review-only favicon PNGs (16, 32, 64px).");
