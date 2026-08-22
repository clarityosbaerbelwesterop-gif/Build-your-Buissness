// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Geprueft wird, was gebaut wird — und das steht in `tsconfig.json` unter
  // `include`: protocol, core, attackers, config, models, db.
  //
  // Am Wurzelverzeichnis liegen ausserdem lose Entwuerfe (Komponenten,
  // Schnipsel, CSS), die zu keinem Programm gehoeren. ESLint hat sie trotzdem
  // angefasst und ist daran gescheitert — „was not found by the project
  // service" —, weil sein Standard „alles" ist und tsconfigs `include` nur
  // fuer den Uebersetzer gilt. Damit war die CI auf `main` rot, ohne dass an
  // der Logik etwas falsch war.
  //
  // Die Muster greifen nur auf oberster Ebene: `*.tsx` ist nicht `**/*.tsx`.
  // Eine Datei in einem der Quellverzeichnisse wird also weiter geprueft.
  {
    ignores: [
      "node_modules",
      "coverage",
      "eslint.config.js",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.mjs",
    ],
  },
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
