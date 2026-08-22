/**
 * Die Migration gegen Neon anwenden.
 *
 * Läuft **nur** in der CI, von Hand ausgelöst (workflow_dispatch). Nicht bei
 * jedem Push: eine Migration, die bei jedem Commit gegen die Datenbank läuft,
 * ist die Sorte Automatik, bei der irgendwann jemand ein `drop` durchrutschen
 * lässt und es niemand vorher gesehen hat.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { gesetzt, optional } from "../config/umgebung.js";
import { zugang } from "../config/zugaenge.js";
import { entschaerfen } from "./entschaerfen.js";
import { neon, projektWaehlen } from "./neon-api.js";

const schluessel = zugang("neonApiKey");
const projekt = await projektWaehlen(schluessel);
console.error(`Projekt: ${projekt.name} (${projekt.id})`);

/**
 * Die Verbindungszeichenfolge fuer dieses Projekt.
 *
 * Bevorzugt `DATABASE_URL` aus den Secrets. Fehlt sie, wird sie ueber die
 * Neon-API geholt — der Schluessel, der das Projekt kennt, darf auch dessen
 * Verbindung nennen. Das erspart ein zweites Secret fuer dieselbe Sache.
 *
 * Sie wird **nie** ausgegeben. Eine Verbindungszeichenfolge traegt das
 * Passwort der Datenbank im Klartext; ein CI-Protokoll liest jeder mit
 * Repo-Zugriff.
 */
async function verbindung(projektId: string): Promise<string> {
  const ausSecret = gesetzt("DATABASE_URL");
  if (ausSecret !== undefined) {
    console.error("Verbindung: aus DATABASE_URL.");
    return ausSecret;
  }

  // Vorgabe als Argument, nicht hinter einem `??`: so steht sie im Aufruf
  // und geht nicht in einer Kette unter (config/umgebung.ts).
  const datenbank = optional("NEON_DATABASE", "neondb");
  const rolle = optional("NEON_ROLE", "neondb_owner");
  const daten = await neon(
    `/projects/${projektId}/connection_uri`
    + `?database_name=${encodeURIComponent(datenbank)}`
    + `&role_name=${encodeURIComponent(rolle)}`,
    schluessel,
  ) as { uri?: unknown };

  if (typeof daten.uri !== "string" || daten.uri.length === 0) {
    throw new Error(
      "Neon hat keine Verbindungszeichenfolge geliefert. "
      + "Dann muss DATABASE_URL als Secret hinterlegt werden.",
    );
  }
  console.error(`Verbindung: über die Neon-API geholt (${datenbank}, Rolle ${rolle}).`);
  return daten.uri;
}

const sql = readFileSync(
  fileURLToPath(new URL("./001_grundschema.sql", import.meta.url)),
  "utf8",
);

const nurLesen = process.argv.includes("--trocken");
if (nurLesen) {
  console.error(`Trockenlauf: ${sql.split(";").length - 1} Anweisungen, nichts gesendet.`);
  process.exit(0);
}

// Direkte Postgres-Verbindung, nicht ueber die API.
//
// Der Weg ueber `/projects/{id}/query` war der naheliegende — er brauchte nur
// den API-Schluessel und keinen Netzweg zur Datenbank. Er existiert nicht
// mehr:
//
//   HTTP 410 — the /projects/{project_id}/query endpoint has been removed;
//   migrate to a direct Postgres connection or the Neon serverless driver
//
// Ein 410 ist keine Stoerung, die sich mit einem zweiten Versuch erledigt.
// Der Endpunkt ist weg, und der Anbieter sagt selbst, was stattdessen gilt.
const klient = new Client({
  connectionString: await verbindung(projekt.id),
  // Neon verlangt TLS. Ohne diese Zeile scheitert die Verbindung mit einer
  // Meldung ueber Zertifikate, die wie ein Netzproblem aussieht.
  ssl: { rejectUnauthorized: true },
});

try {
  await klient.connect();
  // Die Datei enthaelt `begin;` … `commit;` und geht als **eine** einfache
  // Anfrage raus. Das ist Absicht: laeuft eine Migration Anweisung fuer
  // Anweisung, kann sie auf halber Strecke stehen bleiben — etwa mit
  // angelegter Tabelle, aber ohne Policy. Das ist der Zustand, den niemand
  // bemerkt, weil alles zu funktionieren scheint.
  await klient.query(sql);
} catch (fehler) {
  // Die Meldung von Postgres nennt Zeile und Grund und ist das Nuetzlichste,
  // was es hier gibt — aber sie kann Teile der Anfrage enthalten. Derselbe
  // Filter wie bei den Antworten der Neon-API.
  throw new Error(`Migration abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  await klient.end();
}

console.error("Schema angewendet.");
console.error("Row Level Security ist auf jeder Tabelle eingeschaltet UND erzwungen.");
