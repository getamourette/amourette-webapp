import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { chromium } from "playwright";
import sharp from "sharp";

const output = new URL("./v1/", import.meta.url);
const exploration = new URL("../explorations/logo-wordmark/", import.meta.url);
const referenceFiles = { emblem: "round-15/ribbon-refined.svg", wordmark: "round-09/fuller-wordmark.svg", favicon: "round-17/ribbon-optical.svg" };
const references = Object.fromEntries(await Promise.all(Object.entries(referenceFiles).map(async ([id, file]) => [id, await readFile(new URL(file, exploration), "utf8")])));
const hash = buffer => createHash("sha256").update(buffer).digest("hex");
const number = value => Number(value.toFixed(8));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.AMOURETTE_CHROMIUM_PATH ? { executablePath: process.env.AMOURETTE_CHROMIUM_PATH } : {}),
  ...(process.env.AMOURETTE_CHROMIUM_LIBDIR ? { env: { ...process.env, LD_LIBRARY_PATH: process.env.AMOURETTE_CHROMIUM_LIBDIR } } : {})
});
let sources;
try {
  const page = await browser.newPage();
  sources = await page.evaluate(references => Object.fromEntries(Object.entries(references).map(([id, text]) => {
    const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
    if (parsed.querySelector("parsererror")) throw new Error(`Invalid ${id} source`);
    const svg = document.importNode(parsed.documentElement, true);
    document.body.append(svg);
    const box = svg.getBBox();
    const bounds = { x: box.x, y: box.y, width: box.width, height: box.height };
    let capital = null;
    if (id === "wordmark") {
      const letter = svg.querySelector('[data-letter="E"]');
      const b = letter.getBBox();
      const matrix = svg.getCTM().inverse().multiply(letter.getCTM());
      const yValues = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix).y);
      capital = { y: Math.min(...yValues), height: Math.max(...yValues) - Math.min(...yValues) };
    }
    svg.querySelector(":scope > title")?.remove();
    const inner = svg.innerHTML.trim().replace(/^[\t ]+$/gm, "");
    svg.remove();
    return [id, { bounds, capital, inner }];
  })), references);
} finally { await browser.close(); }

const palette = { cream: "#EFE6E0", ruby: "#CC1436", ink: "#1A0F12" };
const files = [];
for (const dir of ["svg", "png", "icons", "licenses"]) await mkdir(new URL(`${dir}/`, output), { recursive: true });

function part(id, x, y, scale) {
  const source = sources[id];
  return `<g data-source="${id}" transform="translate(${number(x - source.bounds.x * scale)} ${number(y - source.bounds.y * scale)}) scale(${number(scale)})">${source.inner}</g>`;
}

function frame(view, content, colour, title) {
  const body = content.replaceAll('fill="currentColor"', `fill="${colour}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view.map(number).join(" ")}" width="${number(view[2])}" height="${number(view[3])}" role="img" aria-label="${title}"><title>${title}</title><g fill="${colour}" color="${colour}">${body}</g></svg>\n`;
}

function composition(layout) {
  const x = 100;
  const wordScale = x / sources.wordmark.capital.height;
  const wordWidth = sources.wordmark.bounds.width * wordScale;
  const wordHeight = sources.wordmark.bounds.height * wordScale;
  const capMiddle = (sources.wordmark.capital.y - sources.wordmark.bounds.y) * wordScale + x / 2;
  if (layout === "emblem") {
    const b = sources.emblem.bounds;
    const margin = b.width / 4;
    return { view: [-margin, -margin, b.width + margin * 2, b.height + margin * 2], ink: [0, 0, b.width, b.height], clearSpace: margin, inner: part("emblem", 0, 0, 1) };
  }
  if (layout === "wordmark") return { view: [-x, -x, wordWidth + 2 * x, wordHeight + 2 * x], ink: [0, 0, wordWidth, wordHeight], clearSpace: x, inner: part("wordmark", 0, 0, wordScale) };
  const markWidth = (layout === "vertical" ? 2.4 : 1.8) * x;
  const markScale = markWidth / sources.emblem.bounds.width;
  const markHeight = sources.emblem.bounds.height * markScale;
  const markX = layout === "vertical" ? (wordWidth - markWidth) / 2 : 0;
  const markY = layout === "vertical" ? 0 : capMiddle - markHeight / 2;
  const wordX = layout === "vertical" ? 0 : markWidth + .65 * x;
  const wordY = layout === "vertical" ? markHeight + .65 * x : 0;
  const top = Math.min(markY, wordY);
  const right = wordX + wordWidth;
  const bottom = Math.max(markY + markHeight, wordY + wordHeight);
  return { view: [-x, top - x, right + 2 * x, bottom - top + 2 * x], ink: [0, top, right, bottom - top], clearSpace: x,
    inner: part("emblem", markX, markY, markScale) + part("wordmark", wordX, wordY, wordScale) };
}

async function save(name, data, meta = {}) {
  await writeFile(new URL(name, output), data);
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  files.push({ file: name, bytes: buffer.length, sha256: hash(buffer), ...meta });
}

const screenMinimum = { vertical: 200, horizontal: 280, wordmark: 192, emblem: 48 };
const rasterWidth = { vertical: 2000, horizontal: 2400, wordmark: 2400, emblem: 1024 };
const geometry = {};
for (const layout of Object.keys(screenMinimum)) {
  const art = composition(layout);
  geometry[layout] = { viewBox: art.view, visibleBounds: art.ink, includedClearSpace: art.clearSpace, minimumScreenFileWidth: screenMinimum[layout] };
  for (const [colour, value] of Object.entries(palette)) {
    const svg = frame(art.view, art.inner, value, `Amourette / ${layout} / ${colour}`);
    await save(`svg/amourette-${layout}-${colour}.svg`, svg, { layout, colour, ...geometry[layout] });
    const { data, info } = await sharp(Buffer.from(svg)).resize({ width: rasterWidth[layout] }).png().toBuffer({ resolveWithObject: true });
    await save(`png/amourette-${layout}-${colour}.png`, data, { layout, colour, width: info.width, height: info.height });
  }
}

const phoneScale = 1024 * .72 / sources.emblem.bounds.width;
const phoneHeight = sources.emblem.bounds.height * phoneScale;
const phone = frame([0, 0, 1024, 1024], '<rect width="1024" height="1024" fill="#120A0F"/>' + part("emblem", (1024 - 1024 * .72) / 2, (1024 - phoneHeight) / 2, phoneScale), palette.cream, "Amourette / B1 phone icon / cream on velvet");
await save("icons/amourette-phone.svg", phone, { role: "phone-icon", artwork: "B1", ribbonWidthRatio: .72 });
for (const size of [180, 192, 512, 1024]) await save(`icons/amourette-phone-${size}.png`, await sharp(Buffer.from(phone)).resize(size, size).removeAlpha().png().toBuffer(), { role: "phone-icon", artwork: "B1", width: size, height: size });

const favicon = frame([0, 0, 512, 512], '<rect width="512" height="512" rx="80" fill="#120A0F"/>' + sources.favicon.inner, palette.cream, "Amourette / F1 favicon / cream on velvet");
await save("icons/favicon.svg", favicon, { role: "favicon", artwork: "F1" });
const faviconBuffers = new Map();
for (const size of [16, 32, 48, 64]) {
  const png = await sharp(Buffer.from(favicon)).resize(size, size).png().toBuffer();
  faviconBuffers.set(size, png);
  await save(`icons/favicon-${size}.png`, png, { role: "favicon", artwork: "F1", width: size, height: size });
}
// ICO directory containing standard PNG images, without an additional codec.
const iconSizes = [16, 32, 48];
const icoHeader = Buffer.alloc(6 + 16 * iconSizes.length);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(iconSizes.length, 4);
let iconOffset = icoHeader.length;
for (const [index, size] of iconSizes.entries()) {
  const pos = 6 + index * 16;
  icoHeader[pos] = size;
  icoHeader[pos + 1] = size;
  icoHeader.writeUInt16LE(1, pos + 4);
  icoHeader.writeUInt16LE(32, pos + 6);
  icoHeader.writeUInt32LE(faviconBuffers.get(size).length, pos + 8);
  icoHeader.writeUInt32LE(iconOffset, pos + 12);
  iconOffset += faviconBuffers.get(size).length;
}
await save("icons/favicon.ico", Buffer.concat([icoHeader, ...iconSizes.map(size => faviconBuffers.get(size))]), { role: "favicon", artwork: "F1", sizes: iconSizes });

await copyFile(new URL("Cormorant-Garamond-OFL.txt", exploration), new URL("licenses/Cormorant-Garamond-OFL.txt", output));
for (const file of ["README.md", "index.html", "styles.css", "licenses/Cormorant-Garamond-OFL.txt"]) {
  const content = await readFile(new URL(file, output));
  files.push({ file, bytes: content.length, sha256: hash(content) });
}
const manifest = {
  version: "1.0", date: "2026-09-08", scope: "Design delivery only; no app integration or shipping.", palette: { ...palette, velvet: "#120A0F" },
  references: Object.fromEntries(Object.entries(referenceFiles).map(([id, path]) => [id, { file: `docs/brand/explorations/logo-wordmark/${path}`, sha256: hash(references[id]), bounds: sources[id].bounds, capital: sources[id].capital }])),
  geometry, files
};
await writeFile(new URL("manifest.json", output), JSON.stringify(manifest, null, 2) + "\n");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// A small deterministic ZIP writer keeps this design delivery dependency-free.
const records = [], directory = [];
let zipOffset = 0;
const dosDate = ((2026 - 1980) << 9) | (9 << 5) | 8;
const archiveFiles = [...files.map(item => item.file), "manifest.json"].sort();
for (const file of archiveFiles) {
  const data = await readFile(new URL(file, output));
  const compressed = deflateRawSync(data);
  const name = Buffer.from(`amourette-logo-v1/${file}`);
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  records.push(local, name, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(zipOffset, 42);
  directory.push(central, name);
  zipOffset += local.length + name.length + compressed.length;
}
const directoryBuffer = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(archiveFiles.length, 8); end.writeUInt16LE(archiveFiles.length, 10); end.writeUInt32LE(directoryBuffer.length, 12); end.writeUInt32LE(zipOffset, 16);
const archive = Buffer.concat([...records, directoryBuffer, end]);
await writeFile(new URL("amourette-logo-v1.zip", output), archive);
console.log(JSON.stringify({ assets: files.length - 4, archiveEntries: archiveFiles.length, zipBytes: archive.length, geometry }, null, 2));
