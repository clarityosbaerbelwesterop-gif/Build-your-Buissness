/**
 * Eine handgeschriebene Migration gegen Neon anwenden.
 *
 * Läuft nur über den manuell ausgelösten GitHub-Workflow. Die Datei muss
 * ausdrücklich aus der erlaubten Liste gewählt werden; dadurch wird eine alte
 * Migration nicht versehentlich bei jedem späteren Lauf erneut abgespielt.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { gesetzt, optional } from "../config/umgebung.js";
import { zugang } from "../config/zugaenge.js";
import { entschaerfen } from "./entschaerfen.js";
import { neon, projektWaehlen } from "./neon-api.js";

const ERLAUBTE_MIGRATIONEN = new Set([
  "001_grundschema.sql",
  "002_protokoll_inhalt.sql",
  "003_control_plane.sql",
  "004_connector_hub.sql",
  "005_billing_credits.sql",
  "006_connector_oauth.sql",
]);

function migrationsdatei(): string {
  const argument = process.argv.find((wert) => wert.startsWith("--datei="));
  const datei = argument?.slice("--datei=".length) ?? "001_grundschema.sql";
  if (!ERLAUBTE_MIGRATIONEN.has(datei)) {
    throw new Error(`Unbekannte Migrationsdatei: ${datei}`);
  }
  return datei;
}

const schluessel = zugang("neonApiKey");
const projekt = await projektWaehlen(schluessel);
const datei = migrationsdatei();
console.error(`Projekt: ${projekt.name} (${projekt.id})`);
console.error(`Migration: ${datei}`);

async function verbindung(projektId: string): Promise<string> {
  const ausSecret = gesetzt("DATABASE_URL");
  if (ausSecret !== undefined) {
    console.error("Verbindung: aus DATABASE_URL.");
    return ausSecret;
  }

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
  fileURLToPath(new URL(`./${datei}`, import.meta.url)),
  "utf8",
);

const nurLesen = process.argv.includes("--trocken");
if (nurLesen) {
  console.error(`Trockenlauf: ${datei} gelesen, nichts gesendet.`);
  process.exit(0);
}

const klient = new Client({
  connectionString: await verbindung(projekt.id),
  ssl: { rejectUnauthorized: true },
});

try {
  await klient.connect();
  await klient.query(sql);
} catch (fehler) {
  throw new Error(`Migration abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  await klient.end();
}

console.error(`Migration angewendet: ${datei}`);
