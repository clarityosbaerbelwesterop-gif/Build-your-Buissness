// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Die Konfigurationsdatei selbst wird nicht typgeprueft — sie liegt nicht im
  // tsconfig-Programm, und sie dort aufzunehmen hiesse, den Uebersetzer auf
  // eine Datei zu richten, die er nie ausliefert.
  { ignores: ["node_modules", "coverage", "eslint.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // CLAUDE.md §5: kein `any` im Diff. Das ist die Stelle, an der die Regel
      // durchgesetzt wird statt nur dazustehen.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": ["error", { allow: ["error"] }],
      // Ein mit _ benanntes Ergebnis ist ausdruecklich weggeworfen — das
      // kommt beim Herausnehmen eines Feldes per Destrukturierung vor.
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
);
