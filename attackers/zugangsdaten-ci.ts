/**
 * CI-Adapter fuer den Zugangsdaten-Angreifer.
 *
 * Die Erkennungsregel lebt in `zugangsdaten.ts`; dieser Adapter entscheidet nur,
 * welche Dateien eines PRs dem Angreifer gegeben werden. Damit koennen CI und
 * Produkt bei derselben Frage nicht auseinanderlaufen.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import type { Datei, Ziel } from "../core/schnittstellen.js";
import { zugangsdatenImQuelltext } from "./zugangsdaten.js";

const basis = process.argv[2];
if (basis === undefined || basis.trim().length === 0) {
  console.error("Basis-Ref fehlt. Aufruf: tsx attackers/zugangsdaten-ci.ts <basis-ref>");
  process.exit(2);
}

const geaendert = execFileSync(
  "git",
  ["diff", "--name-only", `${basis}...HEAD`],
  { encoding: "utf8" },
)
  .split("\n")
  .map((pfad) => pfad.trim())
  .filter((pfad) => pfad.length > 0 && existsSync(pfad));

const dateien: Datei[] = geaendert.map((pfad) => ({
  pfad,
  inhalt: readFileSync(pfad, "utf8"),
}));

const ziel: Ziel = { lauf_id: "ci-zugangsdaten", dateien };
const funde = await zugangsdatenImQuelltext.angreifen(ziel, {
  runde: 1,
  bisherige: [],
});

if (funde.length > 0) {
  console.error("Zugangsdaten in geaenderten Dateien gefunden:");
  for (const fund of funde) console.error(`  ${fund.nachweis}`);
  console.error("Werte gehoeren in Laufzeit-Umgebungsvariablen, nicht in den Quelltext.");
  process.exit(1);
}

console.error("Keine Zugangsdaten in geaenderten Dateien gefunden.");
