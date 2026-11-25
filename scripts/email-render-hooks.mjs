// Lets a Node logic test import an email template (`.tsx`, `@/` imports) and
// render the exact HTML a guest receives, without a bundler. Import this module
// first, then load the template with a dynamic `import()`.
import { readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const rootUrl = pathToFileURL(root).href;
const withExtension = path => ['', '.ts', '.tsx', '/index.ts'].map(suffix => path + suffix).find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile());

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      const file = withExtension(root + specifier.slice(2));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const file = withExtension(fileURLToPath(new URL(specifier, context.parentURL)));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts') && url.startsWith(rootUrl)) return next(url, { ...context, format: 'module-typescript' });
    if (!url.endsWith('.tsx')) return next(url, context);
    const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});
