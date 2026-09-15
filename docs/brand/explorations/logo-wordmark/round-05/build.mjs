// Generate two R-tail explorations without changing the previous round.
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../03-flourish.svg', import.meta.url), 'utf8');
const previous = 'M290.6 319.3 L358.4 340.15 C432 219 493 103 574 30 C630 -21 702 -49 783 -21 C750 -66 662 -84 588 -51 C488 -7 397 148 290.6 319.3 Z';
if (!source.includes(previous)) throw new Error('The round 4 R outline has changed. Inspect it before rebuilding.');
const variants = [
  {
    name: 'A / Under the E',
    file: 'a-under-e.svg',
    path: 'M290.6 319.3 L358.4 340.15 C432 219 493 103 574 30 C675 -66 851 -107 1065 -38 C956 -104 784 -137 660 -103 C528 -67 402 142 290.6 319.3 Z',
  },
  {
    name: 'B / Extended gesture',
    file: 'b-extended.svg',
    path: 'M290.6 319.3 L358.4 340.15 C432 219 492 108 574 30 C730 -107 1005 -121 1255 -32 C1111 -109 872 -161 700 -116 C543 -75 403 143 290.6 319.3 Z',
  },
];
for (const variant of variants) {
  const result = source.replace(previous, variant.path)
    .replaceAll('The sweeping R', variant.name)
    .replace(/(viewBox="0 0 [\d.]+) 900"/, '$1 940"');
  await writeFile(new URL(variant.file, import.meta.url), result);
}
console.log('Generated two R-tail variants from the preserved round 4 artwork.');
