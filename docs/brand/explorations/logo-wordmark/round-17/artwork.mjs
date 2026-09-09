export const candidates = [
  { id: "original", code: "B1", name: "Unchanged ribbon", file: "../round-15/ribbon-refined.svg", note: "The selected drawing, only reduced. The reference to keep if an optical version changes too much." },
  { id: "optical", code: "F1", name: "Optical ribbon", file: "ribbon-optical.svg", note: "Broader fine returns and separated ends. More material where detail disappears, with the two loops and both ends retained." },
  { id: "shorthand", code: "F2", name: "Loop shorthand", file: "ribbon-shorthand.svg", note: "Free variation: F1’s two loops without the loose ends. A more abbreviated symbol; the main B1 drawing is not replaced." }
];

export function iconSvg(source) {
  // Known local SVG sources only. Keep the complete drawing in its original frame.
  if (!source.includes('viewBox="0 0 512 512"') || !source.includes("</svg>")) throw new Error("Unexpected source frame");
  const artwork = source.slice(source.indexOf(">") + 1, source.lastIndexOf("</svg>"));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" aria-hidden="true"><rect width="512" height="512" rx="80" fill="#120A0F"/><g color="#EFE6E0">${artwork}</g></svg>`;
}
