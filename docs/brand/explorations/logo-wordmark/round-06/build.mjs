// Revisit the first generated cream B: a descending leg and a short upturned tip.
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../03-flourish.svg', import.meta.url), 'utf8');
const previous = 'M290.6 319.3 L358.4 340.15 C432 219 493 103 574 30 C630 -21 702 -49 783 -21 C750 -66 662 -84 588 -51 C488 -7 397 148 290.6 319.3 Z';
if (!source.includes(previous)) throw new Error('Inspect the source R before rebuilding.');
const variants = [
  {
    file: 'a-returning-tip.svg',
    name: 'A / Returning to the original B',
    path: 'M290.6 319.3 L358.4 340.15 C440 330 501 190 563 62 C624 -63 752 -145 856 -120 C873 -116 887 -109 897 -103 L900 -111 C878 -135 834 -151 791 -150 C680 -149 590 -99 523 9 C439 144 350 308 290.6 319.3 Z',
  },
  {
    file: 'b-lighter-tip.svg',
    name: 'B / A lighter finish',
    path: 'M290.6 319.3 L358.4 340.15 C433 319 498 184 562 61 C639 -84 788 -150 889 -105 C905 -98 916 -89 925 -80 L930 -86 C908 -119 861 -147 812 -151 C697 -164 593 -102 523 9 C439 144 350 308 290.6 319.3 Z',
  },
];
for (const variant of variants) {
  const result = source.replace(previous, variant.path)
    .replaceAll('The sweeping R', variant.name)
    .replace(/(viewBox="0 0 [\d.]+) 900"/, '$1 1000"');
  await writeFile(new URL(variant.file, import.meta.url), result);
}
console.log('Generated the original-B-inspired R and one lighter-tip alternative.');
