import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { pflicht } from "../config/umgebung.js";
import type { Protokoll } from "../protocol/v1.js";
import { identitaetNachVerifikation, type SqlVerbindung } from "./auth-kontext.js";
import { entschaerfen } from "./entschaerfen.js";
import { projektWaehlen, zweigAnlegen, zweigLoeschen } from "./neon-api.js";
import { protokollLaden, protokollSpeichern } from "./protokoll-speicher.js";

const MIGRATION = readFileSync(
  fileURLToPath(new URL("./002_protokoll_inhalt.sql", import.meta.url)),
  "utf8",
);

function verbindungFuer(klient: Client): SqlVerbindung {
  return {
    async query(sql: string, werte: unknown[] = []) {
      const ergebnis = await klient.query(sql, werte);
      return { rows: ergebnis.rows as Record<string, unknown>[] };
    },
  };
}

function protokollFuer(laufId: string, suffix: string): Protokoll {
  const zeit = 1_780_000_000_000;
  const befund = {
    id: `${laufId}-1`,
    kategorie: "authentifizierung" as const,
    angriffsklasse: `route-auth-${suffix}`,
    schweregrad: "mittel" as const,
    klartext: "Eine geschützte Route wurde auf eine vorhandene Auth-Prüfung untersucht.",
    nachweis: `routes/${suffix}.ts:12`,
    zustand: "behoben" as const,
    runde: 1,
    zeitstempel: zeit + 100,
  };
  return {
    version: 1,
    lauf_id: laufId,
    begonnen: zeit,
    beendet: zeit + 500,
    gelaufene_klassen: [`route-auth-${suffix}`],
    runden: [{
      nummer: 1,
      gelaufene_klassen: [`route-auth-${suffix}`],
      befunde: [befund],
      kosten: { tokens_ein: 20, tokens_aus: 8, laufzeit_ms: 500 },
    }],
    befunde: [befund],
    endzustand: "sauber",
    abbruchgrund: "keine_offenen_befunde",
    kosten_gesamt: { tokens_ein: 20, tokens_aus: 8, laufzeit_ms: 500 },
  };
}

function gleich(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const schluessel = pflicht("NEON_API_KEY", "einen Zweig für den Backend-Nachweis anlegen");
const projekt = await projektWaehlen(schluessel);
const zweig = await zweigAnlegen(projekt.id, schluessel, `backend-nachweis-${Date.now()}`);
console.error(`Backend-Nachweis auf Zweig ${zweig.name} (${zweig.id}).`);

const klient = new Client({
  connectionString: zweig.verbindung,
  ssl: { rejectUnauthorized: true },
});
let fehlgeschlagen = false;

try {
  await klient.connect();

  const alt = await klient.query<{ anzahl: number }>(
    "select count(*)::int as anzahl from protokolle",
  );
  const anzahlAlt = alt.rows[0]?.anzahl ?? 0;
  if (anzahlAlt > 0) {
    throw new Error("Vorhandene Protokolle ohne kanonischen Inhalt blockieren M0.6.");
  }

  await klient.query(MIGRATION);

  const rollen = await klient.query<{ rolcanlogin: boolean; rolbypassrls: boolean }>(
    "select rolcanlogin, rolbypassrls from pg_roles where rolname = 'byb_app'",
  );
  const rolle = rollen.rows[0];
  if (rolle === undefined || rolle.rolcanlogin || rolle.rolbypassrls) {
    throw new Error("Die Laufzeitrolle byb_app hat unerwartete Rollenrechte.");
  }

  const db = verbindungFuer(klient);
  const identitaetA = identitaetNachVerifikation("nachweis-nutzer-a");
  const identitaetB = identitaetNachVerifikation("nachweis-nutzer-b");
  const a = protokollFuer(randomUUID(), "a");
  const b = protokollFuer(randomUUID(), "b");

  await protokollSpeichern(db, identitaetA, a, "Backend-Nachweis A");
  await protokollSpeichern(db, identitaetB, b, "Backend-Nachweis B");

  const aEigen = await protokollLaden(db, identitaetA, a.lauf_id);
  const bEigen = await protokollLaden(db, identitaetB, b.lauf_id);
  const aSiehtB = await protokollLaden(db, identitaetA, b.lauf_id);
  const bSiehtA = await protokollLaden(db, identitaetB, a.lauf_id);

  if (!gleich(aEigen, a) || !gleich(bEigen, b)) {
    throw new Error("Ein gespeichertes Protokoll kam nicht verlustfrei zurück.");
  }
  if (aSiehtB !== undefined || bSiehtA !== undefined) {
    throw new Error("Die Mandantentrennung beim Protokoll-Lesen wurde verletzt.");
  }

  console.error("Geprüft: zwei Protokolle gespeichert und verlustfrei gelesen.");
  console.error("Geprüft: Nutzer A und B sehen das Protokoll des jeweils anderen nicht.");
  console.error("Geprüft: Laufzeitrolle ist NOLOGIN und NOBYPASSRLS.");
} catch (fehler) {
  fehlgeschlagen = true;
  console.error(`Backend-Nachweis abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  await klient.end().catch(() => undefined);
  await zweigLoeschen(projekt.id, schluessel, zweig.id);
  console.error(`Zweig gelöscht: ${zweig.name}`);
}

process.exit(fehlgeschlagen ? 1 : 0);
