import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}", "lib/strings.ts", "lib/email-preference-strings.ts"],
    rules: {
      // Check copy, including decoded Unicode escapes and JSX entities, not comments.
      "no-restricted-syntax": [
        "error",
        ...["Literal[value=/—/]", "TemplateElement[value.cooked=/—/]", "JSXText[value=/—/]"]
          .map((selector) => ({
            selector,
            message: "Use natural punctuation or rewording instead of an em dash in application copy (docs/design.md).",
          })),
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
