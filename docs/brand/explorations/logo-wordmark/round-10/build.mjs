// Fit vector contours to the selected emblem exploration and compose them
// with the existing, unchanged wordmarks. Requires sharp and Potrace.
import sharp from 'sharp';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('.',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'amourette-emblems-'));
const image=new URL('generated-concepts.png',import.meta.url);
const concepts=[
  {slug:'shared-a',name:'The shared A',box:{left:48,top:205,width:420,height:386},extent:400},
  {slug:'fleeting-tie',name:'The fleeting tie',box:{left:553,top:255,width:429,height:314},extent:430},
  {slug:'first-exchange',name:'The first exchange',box:{left:1090,top:310,width:359,height:254},extent:385},
];
const wordmarks={};
for(const variant of ['balanced','fuller'])wordmarks[variant]=await readFile(new URL(`../round-09/${variant}-wordmark.svg`,import.meta.url),'utf8');

function inner(svg){return svg.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace(/<title>[\s\S]*?<\/title>/g,'');}
function view(svg){const values=svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);return values;}
for(const concept of concepts){
  const {data,info}=await sharp(fileURLToPath(image)).extract(concept.box).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const rows=[];
  for(let y=0;y<info.height;y++){
    const row=[];
    for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels;row.push((data[i]+data[i+1]+data[i+2])/3>140?'1':'0');}
    rows.push(row.join(' '));
  }
  const input=join(scratch,concept.slug+'.pbm');const output=join(scratch,concept.slug+'.svg');
  await writeFile(input,`P1\n${info.width} ${info.height}\n${rows.join('\n')}\n`);
  execFileSync(process.env.POTRACE_BIN||'potrace',[input,'--svg','--tight','--turdsize','3','--opttolerance','0.12','--unit','100','--output',output]);
  const trace=await readFile(output,'utf8');const [, ,width,height]=view(trace);const scale=concept.extent/Math.max(width,height);
  const x=(512-width*scale)/2;const y=(512-height*scale)/2;
  const artwork=inner(trace).replace(/<metadata>[\s\S]*?<\/metadata>/g,'').replace(/fill="#000000"/g,'fill="currentColor"');
  const content=`<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)})">${artwork}</g>`;
  const symbol=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Amourette: ${concept.name}"><title>${concept.name}</title>${content}</svg>\n`;
  await writeFile(join(directory,concept.slug+'.svg'),symbol);
  // A subtle optical lift for tiny displays; the large contour stays untouched.
  const small=symbol.replace(/stroke="none"/g,'stroke="currentColor" stroke-width="17" stroke-linejoin="round"');
  await writeFile(join(directory,concept.slug+'-small.svg'),small);
  for(const variant of ['balanced','fuller']){
    const wordmark=wordmarks[variant];const [, ,ww,wh]=view(wordmark);
    const lockup=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 950" role="img" aria-label="AMOURETTE with ${concept.name}"><title>AMOURETTE / ${concept.name}</title><svg x="1028" y="20" width="344" height="344" viewBox="0 0 512 512">${content}</svg><svg x="120" y="445" width="2160" height="${(2160*wh/ww).toFixed(3)}" viewBox="0 0 ${ww} ${wh}">${inner(wordmark)}</svg></svg>\n`;
    await writeFile(join(directory,concept.slug+'-'+variant+'.svg'),lockup);
  }
}
console.log('Built three emblems, small-scale variants, and six lockups. Original wordmark contours preserved.');
