// Bounded, local diagnostics only: no filenames, image bytes, account IDs or telemetry.
export function photoMeasure(stage: string, start: number, detail?: Record<string, number | string | boolean>) {
  const name = `photo.${stage}`;
  if (performance.getEntriesByName(name).length >= 20) performance.clearMeasures(name);
  performance.measure(name, { start, detail });
}
