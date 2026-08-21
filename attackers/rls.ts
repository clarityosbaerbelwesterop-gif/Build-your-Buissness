/**
 * Angreifer: Tabellen mit Mandantenbezug ohne Row Level Security.
 *
 * CLAUDE.md §2.5: „Row Level Security auf jeder Tabelle mit Mandantenbezug.
 * Ohne Policy keine Tabelle."
 *
 * Der Fund, den dieser Angreifer sucht, ist der teuerste im ganzen Produkt:
 * eine Tabelle mit einer Spalte wie `user_id` oder `tenant_id`, aber ohne
 * Regel, die den Zugriff darauf beschränkt. Die App liefert dann die Zeilen
 * fremder Konten aus — und niemand merkt es, bis es jemand merkt.
 *
 * Drei Stufen, absteigend in der Schwere:
 *
 * 1. **Gar kein RLS.** Jeder mit einer Verbindung sieht alles.
 * 2. **RLS ohne Policy.** Technisch dicht, praktisch leer — die App
 *    funktioniert nicht, was schnell auffällt und deshalb weniger gefährlich
 *    ist als Stufe 1.
 * 3. **RLS ohne FORCE.** Der heimtückische Fall: es steht eine Regel da, aber
 *    der Eigentümer der Tabelle umgeht sie. Und Anwendungen verbinden sich
 *    fast immer als Eigentümer. Sieht abgesichert aus, ist es nicht.
 */

import type { Angreifer, RoherBefund, Ziel } from "../core/schnittstellen.js";

/** Eine Datei mit Schema. Migrationen liegen üblicherweise als .sql vor. */
const SCHEMA_DATEI = /\.(sql)$/i;

/**
 * Spalten, die einen Mandantenbezug anzeigen.
 *
 * Ohne so eine Spalte gehört eine Tabelle allen gemeinsam — eine Preisliste
 * braucht kein RLS. Die Liste zu prüfen statt jede Tabelle zu melden ist der
 * Unterschied zwischen einem brauchbaren Prüfbericht und Rauschen.
 */
const MANDANTENSPALTE =
  /\b(user_id|owner_id|tenant_id|account_id|organisation_id|organization_id|kunde_id|besitzer)\b/i;

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z_][a-z0-9_]*)["`]?\s*\(/gi;

interface Tabelle {
  readonly name: string;
  readonly rumpf: string;
  readonly pfad: string;
  readonly zeile: number;
}

function tabellenAus(pfad: string, sql: string): Tabelle[] {
  const gefunden: Tabelle[] = [];
  CREATE_TABLE.lastIndex = 0;
  let treffer: RegExpExecArray | null;
  while ((treffer = CREATE_TABLE.exec(sql)) !== null) {
    const name = treffer[1];
    if (name === undefined) continue;
    // Vom oeffnenden ( bis zur passenden schliessenden Klammer.
    let tiefe = 0;
    let ende = treffer.index + treffer[0].length - 1;
    for (let i = ende; i < sql.length; i++) {
      const z = sql[i];
      if (z === "(") tiefe++;
      else if (z === ")") {
        tiefe--;
        if (tiefe === 0) {
          ende = i;
          break;
        }
      }
    }
    gefunden.push({
      name,
      rumpf: sql.slice(treffer.index, ende + 1),
      pfad,
      zeile: sql.slice(0, treffer.index).split("\n").length,
    });
  }
  return gefunden;
}

export const tabelleOhneRls: Angreifer = {
  klasse: "tabelle-ohne-rls",
  kategorie: "datenzugriff",
  brauchtLaufzeit: false,
  angreifen: (ziel: Ziel) => Promise.resolve(pruefen(ziel)),
};

function pruefen(ziel: Ziel): RoherBefund[] {
  const funde: RoherBefund[] = [];
  for (const datei of ziel.dateien) {
    if (!SCHEMA_DATEI.test(datei.pfad)) continue;
    const sql = datei.inhalt;
    const klein = sql.toLowerCase();

    for (const tabelle of tabellenAus(datei.pfad, sql)) {
      if (!MANDANTENSPALTE.test(tabelle.rumpf)) continue;

      const n = tabelle.name.toLowerCase();
      const hatEnable = klein.includes(`alter table ${n} enable row level security`);
      const hatForce = klein.includes(`alter table ${n} force row level security`);
      const hatPolicy = new RegExp(`create\\s+policy\\s+[^;]*\\bon\\s+["\`]?${n}\\b`, "i")
        .test(sql);
      const ort = `${tabelle.pfad}:${tabelle.zeile}  ${tabelle.name}`;

      if (!hatEnable) {
        funde.push({
          schweregrad: "kritisch",
          klartext:
            `Die Tabelle „${tabelle.name}" enthält Daten je Konto, aber es gibt keine `
            + `Zugriffsregel darauf. Wer die Datenbank erreicht, sieht die Daten aller `
            + `Konten, nicht nur die eigenen.`,
          nachweis: `${ort}  — kein ENABLE ROW LEVEL SECURITY`,
        });
        continue;
      }
      if (!hatPolicy) {
        funde.push({
          schweregrad: "hoch",
          klartext:
            `Für die Tabelle „${tabelle.name}" ist der Schutz eingeschaltet, aber es ist `
            + `keine Regel hinterlegt, wer welche Zeilen sehen darf. Die Tabelle wirkt `
            + `dadurch leer, und der Teil der Anwendung, der sie braucht, funktioniert nicht.`,
          nachweis: `${ort}  — ENABLE ohne CREATE POLICY`,
        });
      }
      if (!hatForce) {
        funde.push({
          schweregrad: "hoch",
          klartext:
            `Die Zugriffsregel auf „${tabelle.name}" gilt nicht für den Eigentümer der `
            + `Tabelle — und die Anwendung meldet sich fast immer als Eigentümer an. Der `
            + `Schutz steht da, greift aber im Betrieb nicht.`,
          nachweis: `${ort}  — ENABLE ohne FORCE ROW LEVEL SECURITY`,
        });
      }
    }
  }
  return funde;
}
