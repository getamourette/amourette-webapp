// Growing, jittered retry delays (#486). When the bar's Wi-Fi or the backend
// fails for everyone at once, a fixed delay makes every phone retry in the same
// second and keeps the backend from recovering. Each failure doubles the wait
// up to a ceiling, and a random half of it spreads the phones apart.
export function backoffDelay(failures: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.max(0, Math.floor(failures)));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
