/**
 * Unser eigenes Schema, geprüft mit unseren eigenen Angreifern.
 *
 * Das ist mehr als eine hübsche Idee: BYB verkauft die Zusage, dass es Lücken
 * dieser Art findet. Fände es sie im eigenen Schema nicht — oder wäre das
 * eigene Schema voll davon — wäre die Zusage nichts wert.
 *
 * Der Test läuft ohne Datenbank. Er liest die Migration als Text; das genügt
 * für alles, was hier zu prüfen ist, und macht ihn in einem frischen Klon
 * ausführbar (USER.md: alles läuft in CI, nichts lokal).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { tabelleOhneRls } from "../attackers/rls.js";
import { zugangsdatenImQuelltext } from "../attackers/zugangsdaten.js";
import type { Datei } from "../core/schnittstellen.js";

const PFAD = "db/001_grundschema.sql";
const SQL = readFileSync(
  fileURLToPath(new URL("./001_grundschema.sql", import.meta.url)),
  "utf8",
);
const DATEI: Datei = { pfad: PFAD, inhalt: SQL };
const KONTEXT = { runde: 1, bisherige: [] };

/** Tabellennamen aus der Migration, ohne die Systemschemata. */
const TABELLEN = [...SQL.matchAll(/create table if not exists (\w+)/gi)]
  .map((t) => t[1])
  .filter((n): n is string => n !== undefined);

describe("Der eigene Angreifer findet im eigenen Schema nichts", () => {
  it("kein Fund bei Row Level Security", async () => {
    const funde = await tabelleOhneRls.angreifen(
      { lauf_id: "selbst", dateien: [DATEI] },
      KONTEXT,
    );
    expect(funde.map((f) => f.nachweis)).toEqual([]);
  });

  it("keine Zugangsdaten in der Migration", async () => {
    const funde = await zugangsdatenImQuelltext.angreifen(
      { lauf_id: "selbst", dateien: [DATEI] },
      KONTEXT,
    );
    expect(funde).toEqual([]);
  });

  it("der Angreifer sieht die Datei überhaupt an", () => {
    // Gegenprobe. Der Test oben wäre auch grün, wenn der Angreifer .sql gar
    // nicht prüfte — dann prüfte er nichts und meldete folgerichtig nichts.
    const kaputt = SQL.replace(/alter table \w+ force\s+row level security;/gi, "");
    expect(kaputt).not.toBe(SQL);
    return tabelleOhneRls
      .angreifen({ lauf_id: "x", dateien: [{ pfad: PFAD, inhalt: kaputt }] }, KONTEXT)
      .then((funde) => {
        expect(funde.length).toBeGreaterThan(0);
        expect(funde.every((f) => f.nachweis.includes("ohne FORCE"))).toBe(true);
      });
  });
});

describe("Jede Tabelle ist dreifach abgesichert", () => {
  it("findet überhaupt Tabellen", () => {
    expect(TABELLEN.length).toBeGreaterThanOrEqual(4);
  });

  it.each(["laeufe", "protokolle", "befunde", "runden"])(
    "%s: enable, force und Policy",
    (tabelle) => {
      // Alle drei Zeilen einzeln geprüft. Zwei davon zu haben ist der
      // gefährlichere Zustand als keine: es sieht abgesichert aus.
      expect(SQL).toContain(`alter table ${tabelle} enable row level security;`);
      expect(SQL).toMatch(new RegExp(`alter table ${tabelle} force\\s+row level security;`));
      expect(SQL).toMatch(new RegExp(`create policy \\w+ on ${tabelle} for all`));
    },
  );

  it.each(["laeufe", "protokolle", "befunde", "runden"])(
    "%s: die Policy prüft auch beim Schreiben",
    (tabelle) => {
      // Ohne WITH CHECK könnte jemand Zeilen auf eine fremde Kennung
      // schreiben, auch wenn er sie nicht lesen kann.
      const abschnitt = SQL.slice(SQL.indexOf(`create policy`, SQL.indexOf(tabelle)));
      const policy = abschnitt.slice(0, abschnitt.indexOf(";"));
      expect(policy).toContain("with check");
    },
  );

  it("bindet jede Policy an dieselbe eine Funktion", () => {
    // Verstreut man die Auswertung des Tokens über die Policies, ändert man
    // beim nächsten Auth-Wechsel zwanzig Stellen und vergisst eine.
    const policies = SQL.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(policies.length).toBeGreaterThanOrEqual(4);
    for (const p of policies) {
      expect(p).toContain("auth.nutzer_kennung()");
    }
    // Und die Funktion liest das JWT genau einmal.
    expect(SQL.match(/request\.jwt\.claims/g)).toHaveLength(1);
  });

  it("hat auf jeder Tabelle die Spalte, an der die Policy hängt", () => {
    for (const tabelle of TABELLEN) {
      const start = SQL.indexOf(`create table if not exists ${tabelle}`);
      const rumpf = SQL.slice(start, SQL.indexOf(");", start));
      expect(rumpf).toContain("nutzer_id");
    }
  });
});

describe("Was das Schema nicht durchlässt", () => {
  it("kennt dieselben Zustände wie der Datenvertrag", async () => {
    // Die Datenbank ist die letzte Stelle, an der ein falscher Wert auffällt.
    // Ein Protokoll mit einem Zustand, den die Anzeige nicht kennt, ist
    // unbrauchbar — deshalb stehen die Listen an beiden Enden.
    const { Zustand, Schweregrad, Kategorie, Abbruchgrund } =
      await import("../protocol/v1.js");
    for (const wert of Zustand.options) expect(SQL).toContain(`'${wert}'`);
    for (const wert of Schweregrad.options) expect(SQL).toContain(`'${wert}'`);
    for (const wert of Kategorie.options) expect(SQL).toContain(`'${wert}'`);
    for (const wert of Abbruchgrund.options) expect(SQL).toContain(`'${wert}'`);
  });

  it("verlangt für den Klartext dieselbe Mindestlänge wie der Datenvertrag", () => {
    expect(SQL).toContain("length(klartext) between 20 and 400");
  });

  it("läuft als eine Einheit oder gar nicht", () => {
    // Ohne Transaktion kann eine Migration auf halber Strecke stehen bleiben —
    // etwa mit angelegter Tabelle, aber ohne Policy. Das ist der Zustand, den
    // niemand bemerkt, weil alles zu funktionieren scheint.
    // Die Datei beginnt mit einem Kommentarblock; geprüft wird, dass die
    // erste Anweisung `begin;` ist und die letzte `commit;`.
    const ohneKommentare = SQL.split("\n")
      .filter((z) => !z.trimStart().startsWith("--") && z.trim().length > 0)
      .join("\n")
      .toLowerCase();
    expect(ohneKommentare.startsWith("begin;")).toBe(true);
    expect(ohneKommentare.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("lässt sich zweimal anwenden, ohne zu scheitern", () => {
    // `create table if not exists` überall — eine Migration, die beim zweiten
    // Lauf abbricht, macht jeden Neuaufbau zum Handbetrieb.
    const createTables = SQL.match(/create table/gi) ?? [];
    const mitWenn = SQL.match(/create table if not exists/gi) ?? [];
    expect(mitWenn).toHaveLength(createTables.length);
  });
});
