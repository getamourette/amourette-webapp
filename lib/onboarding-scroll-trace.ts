// Temporary #216 wire format: numeric rows keep runtime logs compact and prevent
// arbitrary field values, URLs, or other text from entering the diagnostic log.
export const SCROLL_EVENTS = [
  "initial", "poll", "pointerdown", "focusin", "focusout", "element-scroll",
  "window-scroll", "window-resize", "orientationchange", "viewport-resize",
  "viewport-scroll", "before-copy", "pagehide",
] as const;
export const SCROLL_ELEMENTS = ["html", "body", "main", "content", "wizard", "progress", "field"] as const;
export const SCROLL_BOX_FIELDS = ["top", "height", "scrollTop", "scrollHeight", "clientHeight"] as const;
export const SCROLL_TAGS = ["HTML", "BODY", "INPUT", "TEXTAREA", "BUTTON", "OTHER"] as const;
export const SCROLL_COLUMNS = [
  "ms", "event", "step", "focused", "scrollingElement", "window.scrollY", "window.innerHeight",
  "viewport.offsetTop", "viewport.pageTop", "viewport.height", "viewport.width", "viewport.scale",
  ...SCROLL_ELEMENTS.flatMap((element) => SCROLL_BOX_FIELDS.map((field) => `${element}.${field}`)),
];

export type ScrollRow = (number | null)[];
export type ScrollBatch = { run: string; batch: number; device: number[]; rows: ScrollRow[] };

export function parseScrollBatch(value: unknown): ScrollBatch | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.run !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.run)) return null;
  if (typeof data.batch !== "number" || !Number.isInteger(data.batch) || data.batch < 0 || data.batch > 600) return null;
  const number = (item: unknown): item is number => typeof item === "number" && Number.isFinite(item) && Math.abs(item) <= 10_000_000;
  if (!Array.isArray(data.device) || data.device.length !== 4 || !data.device.every(number)) return null;
  if (!Array.isArray(data.rows) || data.rows.length < 1 || data.rows.length > 20) return null;
  if (!data.rows.every((row: unknown): row is ScrollRow =>
    Array.isArray(row) && row.length === SCROLL_COLUMNS.length && row.every((item: unknown) => item === null || number(item))
  )) return null;
  return { run: data.run, batch: data.batch, device: data.device, rows: data.rows };
}
