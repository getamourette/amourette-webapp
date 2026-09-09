// Keep the original B's shorter R proportions; adjust the R/E spacing separately.
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../03-flourish.svg', import.meta.url), 'utf8');
const prior = await readFile(new URL('../round-06/a-returning-tip.svg', import.meta.url), 'utf8');
const old = 'M290.6 319.3 L358.4 340.15 C432 219 493 103 574 30 C630 -21 702 -49 783 -21 C750 -66 662 -84 588 -51 C488 -7 397 148 290.6 319.3 Z';
if (!source.includes(old)) throw new Error('Source outline changed.');
const variants = [
  {file:'a-compact.svg',name:'A / Shorter curve',path:'M290.6 319.3 L358.4 340.15 C412 330 453 190 499 62 C544 -52 639 -124 716 -103 C728 -99 739 -93 746 -87 L750 -94 C733 -116 701 -130 669 -130 C586 -129 519 -85 469 9 C406 144 339 308 290.6 319.3 Z'},
  {file:'b-compact-lift.svg',name:'B / Shorter curve, lifted tip',path:'M290.6 319.3 L358.4 340.15 C412 330 453 190 499 62 C552 -67 645 -125 714 -98 C730 -92 741 -84 748 -75 L753 -82 C739 -108 706 -128 674 -131 C590 -136 520 -87 469 9 C406 144 339 308 290.6 319.3 Z'},
];
function rOnly(svg, name){
  const groups=[...svg.matchAll(/<g transform="translate\(([\d.]+) 0\)">([\s\S]*?)<\/g>/g)];
  if(groups.length!==9)throw new Error('Expected nine letter groups.');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 1000" role="img" aria-label="${name}"><g transform="translate(60 740) scale(1 -1)" fill="currentColor">${groups[4][2]}</g></svg>\n`;
}
for(const variant of variants){
  let result=source.replace(old,variant.path).replaceAll('The sweeping R',variant.name);
  let index=0;
  result=result.replace(/<g transform="translate\(([\d.]+) 0\)">/g,(match,x)=>index++>=5?`<g transform="translate(${Number(x)-110} 0)">`:match);
  result=result.replace(/viewBox="0 0 ([\d.]+) 900"/,(_,width)=>`viewBox="0 0 ${Number(width)-110} 1000"`);
  await writeFile(new URL(variant.file,import.meta.url),result);
  await writeFile(new URL(variant.file.replace('.svg','-r.svg'),import.meta.url),rOnly(result,variant.name));
}
await writeFile(new URL('previous-r.svg',import.meta.url),rOnly(prior,'Previous R: too long'));
console.log('Two shorter R variants generated; only the R/E pair is tightened.');
