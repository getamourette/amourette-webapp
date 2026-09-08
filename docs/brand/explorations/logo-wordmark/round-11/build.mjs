// Fit exploration contours and compose them with unchanged round 9 lettering.
// Original round 10 B and C assets are referenced directly, never regenerated.
import sharp from 'sharp';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=fileURLToPath(new URL('.',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'amourette-conversation-'));
const concepts=[
  {slug:'the-aside',name:'The aside',extent:410},
  {slug:'the-reply',name:'The reply',extent:410},
  {slug:'face-to-face',name:'Face to face',extent:410},
];
const wordmarks={};
for(const variant of ['balanced','fuller']){
  wordmarks[variant]=await readFile(new URL(`../round-09/${variant}-wordmark.svg`,import.meta.url),'utf8');
}

function inner(svg){
  return svg.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace(/<title>[\s\S]*?<\/title>/g,'');
}
function view(svg){return svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);}

for(const concept of concepts){
  // Account for source alpha when extracting the visible contour; this is
  // an intermediate tracing mask, not an edited bitmap deliverable.
  const source=join(directory,concept.slug+'-source.png');
  const {data,info}=await sharp(source).flatten({background:'#120a0f'}).raw().toBuffer({resolveWithObject:true});
  const rows=[];
  for(let y=0;y<info.height;y++){
    const row=[];
    for(let x=0;x<info.width;x++){
      const i=(y*info.width+x)*info.channels;
      row.push((data[i]+data[i+1]+data[i+2])/3>150?'1':'0');
    }
    rows.push(row.join(' '));
  }
  const input=join(scratch,concept.slug+'.pbm');
  const output=join(scratch,concept.slug+'.svg');
  await writeFile(input,`P1\n${info.width} ${info.height}\n${rows.join('\n')}\n`);
  execFileSync(process.env.POTRACE_BIN||'potrace',[input,'--svg','--tight','--turdsize','16','--opttolerance','0.3','--unit','100','--output',output]);
  const trace=await readFile(output,'utf8');
  const [,,width,height]=view(trace);
  const scale=concept.extent/Math.max(width,height);
  const x=(512-width*scale)/2;
  const y=(512-height*scale)/2;
  const artwork=inner(trace).replace(/<metadata>[\s\S]*?<\/metadata>/g,'').replace(/fill="#000000"/g,'fill="currentColor"');
  const content=`<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)})">${artwork}</g>`;
  const symbol=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Amourette: ${concept.name}"><title>${concept.name}</title>${content}</svg>\n`;
  await writeFile(join(directory,concept.slug+'.svg'),symbol);
  for(const variant of ['balanced','fuller']){
    const wordmark=wordmarks[variant];
    const [,,ww,wh]=view(wordmark);
    const lockup=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 950" role="img" aria-label="AMOURETTE with ${concept.name}"><title>AMOURETTE / ${concept.name}</title><svg x="1028" y="20" width="344" height="344" viewBox="0 0 512 512">${content}</svg><svg x="120" y="445" width="2160" height="${(2160*wh/ww).toFixed(3)}" viewBox="0 0 ${ww} ${wh}">${inner(wordmark)}</svg></svg>\n`;
    await writeFile(join(directory,concept.slug+'-'+variant+'.svg'),lockup);
  }
}
console.log('Built three new conversation symbols and six compositions; B, C, and lettering unchanged.');
