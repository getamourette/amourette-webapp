// Render production TSX outside Playwright's component-test JSX transform.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const require = createRequire(import.meta.url);
let js=ts.transpileModule(readFileSync('emails/UpcomingNightsEmail.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
js=js.replace('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href))
  .replace('"@react-email/render"',JSON.stringify(pathToFileURL(require.resolve('@react-email/render')).href))
  .replace('"@/lib/email-campaigns"',JSON.stringify(new URL('../lib/email-campaigns.ts',import.meta.url).href));
const {renderUpcomingNightsEmail}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const props=JSON.parse(readFileSync(0,'utf8'));
const entries=await Promise.all(['en','fr','es'].map(async locale=>[locale,await renderUpcomingNightsEmail({...props,locale})]));
process.stdout.write(JSON.stringify(Object.fromEntries(entries)));
