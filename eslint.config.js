import tseslint from "typescript-eslint";

// Intentionally minimal: this isn't a full style ruleset (Prettier handles
// formatting). It enables the type-aware async-safety rules that matter most for
// an OAuth server full of awaited DB/crypto calls — an unhandled promise here is
// a real bug, not a style nit. Scoped to src/, which tsconfig type-checks.
export default tseslint.config({
  files: ["src/**/*.ts", "src/**/*.tsx"],
  extends: [tseslint.configs.base],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
  },
});
