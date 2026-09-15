// Open the R/E pair by 60 font units, preserving every outline and later gap.
import { readFile, writeFile } from 'node:fs/promises';
for (const name of ['balanced', 'fuller']) {
  const original = await readFile(new URL(`../round-08/${name}-wordmark.svg`, import.meta.url), 'utf8');
  let index = 0;
  const updated = original
    .replace(/<g data-letter="([A-Z])" transform="translate\(([\d.]+) 0\)">/g, (match, letter, x) =>
      index++ >= 5 ? `<g data-letter="${letter}" transform="translate(${Number(x) + 60} 0)">` : match)
    .replace(/viewBox="0 0 ([\d.]+) 920"/, (_, width) => `viewBox="0 0 ${Number(width) + 60} 920"`);
  if (index !== 9) throw new Error('Expected exactly nine letter groups.');
  const outlines = text => [...text.matchAll(/<path d="([^"]+)"/g)].map(match => match[1]);
  if (JSON.stringify(outlines(original)) !== JSON.stringify(outlines(updated))) throw new Error('An outline changed unexpectedly.');
  await writeFile(new URL(`${name}-wordmark.svg`, import.meta.url), updated);
}
console.log('R/E spacing opened on both wordmarks; all outlines are unchanged.');
