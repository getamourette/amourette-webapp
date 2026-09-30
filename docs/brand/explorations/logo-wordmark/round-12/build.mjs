// Build F contour studies with unchanged round 9 lettering.
// F1 has a native contour redraw; F2/F3 retain fitted exploration contours.
import sharp from 'sharp';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('.',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'amourette-f-refinement-'));
const concepts=[
  {slug:'the-hint',name:'The hint'},
  {slug:'the-interval',name:'The interval'},
  {slug:'two-breaths',name:'Two breaths'},
];
const wordmarks={};
for(const variant of ['balanced','fuller']){
  wordmarks[variant]=await readFile(new URL(`../round-09/${variant}-wordmark.svg`,import.meta.url),'utf8');
}
function inner(svg){return svg.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace(/<title>[\s\S]*?<\/title>/g,'');}
function view(svg){return svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);}

async function trace(slug){
  const {data,info}=await sharp(join(directory,slug+'-source.png')).flatten({background:'#120a0f'}).raw().toBuffer({resolveWithObject:true});
  const rows=[];
  for(let y=0;y<info.height;y++){
    const row=[];
    for(let x=0;x<info.width;x++){
      const i=(y*info.width+x)*info.channels;
      row.push((data[i]+data[i+1]+data[i+2])/3>150?'1':'0');
    }
    rows.push(row.join(' '));
  }
  const input=join(scratch,slug+'.pbm');
  const output=join(scratch,slug+'.svg');
  await writeFile(input,`P1\n${info.width} ${info.height}\n${rows.join('\n')}\n`);
  execFileSync(process.env.POTRACE_BIN||'potrace',[input,'--svg','--tight','--turdsize','16','--opttolerance','0.3','--unit','100','--output',output]);
  const source=await readFile(output,'utf8');
  const [,,width,height]=view(source);
  const scale=410/Math.max(width,height);
  const x=(512-width*scale)/2;
  const y=(512-height*scale)/2;
  const content=inner(source).replace(/<metadata>[\s\S]*?<\/metadata>/g,'').replace(/fill="#000000"/g,'fill="currentColor"');
  return `<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)})">${content}</g>`;
}

for(const concept of concepts){
  let content;
  if(concept.slug==='the-hint'){
    const drawing=await readFile(join(directory,'the-hint-drawing.svg'),'utf8');
    const path=drawing.match(/<path id="hint-left" d="([^"]+)"/)[1];
    // Expand the mirrored uses so repeated inline specimens have no shared IDs.
    content=`<g fill="currentColor" transform="translate(0 23)"><path d="${path}" transform="translate(-12 0)"/><path d="${path}" transform="translate(524 0) scale(-1 1)"/></g>`;
  }else content=await trace(concept.slug);
  const symbol=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Amourette: ${concept.name}"><title>${concept.name}</title>${content}</svg>\n`;
  await writeFile(join(directory,concept.slug+'.svg'),symbol);
  for(const variant of ['balanced','fuller']){
    const wordmark=wordmarks[variant];
    const [,,ww,wh]=view(wordmark);
    const lockup=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 950" role="img" aria-label="AMOURETTE with ${concept.name}"><title>AMOURETTE / ${concept.name}</title><svg x="1028" y="20" width="344" height="344" viewBox="0 0 512 512">${content}</svg><svg x="120" y="445" width="2160" height="${(2160*wh/ww).toFixed(3)}" viewBox="0 0 ${ww} ${wh}">${inner(wordmark)}</svg></svg>\n`;
    await writeFile(join(directory,concept.slug+'-'+variant+'.svg'),lockup);
  }
}
console.log('Built F1/F2/F3 with unchanged lettering. Previous emblems preserved.');
