import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { pflicht } from "../config/umgebung.js";
import {
  projektWerkzeugeFuerWorkerLaden,
  projektWerkzeugeLaden,
  projektWerkzeugeSpeichern,
  verbindungenLaden,
  verbindungSpeichern,
} from "../connector-hub/speicher.js";
import {
  ConnectorVerbindung,
  UnternehmensWerkzeuge,
  type ConnectorAnbieter,
  type ConnectorVerbindung as ConnectorVerbindungTyp,
  type Ressourcenart,
} from "../connector-hub/v1.js";
import {
  identitaetNachVerifikation,
  type SqlVerbindung,
} from "./auth-kontext.js";
import { entschaerfen } from "./entschaerfen.js";
import { projektWaehlen, zweigAnlegen, zweigLoeschen } from "./neon-api.js";
import { mitWorkerTransaktion } from "./worker-kontext.js";

const MIGRATION_002 = readFileSync(
  fileURLToPath(new URL("./002_protokoll_inhalt.sql", import.meta.url)),
  "utf8",
);
const MIGRATION_003 = readFileSync(
  fileURLToPath(new URL("./003_control_plane.sql", import.meta.url)),
  "utf8",
);
const MIGRATION_004 = readFileSync(
  fileURLToPath(new URL("./004_connector_hub.sql", import.meta.url)),
  "utf8",
);

function dbFuer(klient: Client): SqlVerbindung {
  return {
    async query(sql: string, werte: unknown[] = []) {
      const ergebnis = await klient.query(sql, werte);
      return { rows: ergebnis.rows as Record<string, unknown>[] };
    },
  };
}

function verbindung(
  id: string,
  anbieter: ConnectorAnbieter,
  art: Ressourcenart,
  ressourcenId: string,
): ConnectorVerbindungTyp {
  return ConnectorVerbindung.parse({
    version: 1,
    id,
    anbieter,
    modus: "oauth",
    konto_ref: `${anbieter}-konto`,
    status: "verbunden",
    scopes: ["read", "write"],
    ressourcen: [{ id: ressourcenId, art, name: `${anbieter} ${ressourcenId}` }],
  });
}

function werkzeuge(suffix: string) {
  return UnternehmensWerkzeuge.parse({
    github_repo: { verbindung_id: "github", ressourcen_id: `firma-${suffix}/repo` },
    backend: { anbieter: "neon", verbindung_id: "neon", ressourcen_id: `neon-${suffix}` },
    vercel_projekt: { verbindung_id: "vercel", ressourcen_id: `vercel-${suffix}` },
  });
}

async function grundlageAnwenden(klient: Client): Promise<void> {
  await klient.query(MIGRATION_002);
  await klient.query(MIGRATION_003);
  await klient.query(MIGRATION_004);
}

const schluessel = pflicht("NEON_API_KEY", "einen Zweig für den Connector-Hub-Nachweis anlegen");
const projekt = await projektWaehlen(schluessel);
const zweig = await zweigAnlegen(
  projekt.id,
  schluessel,
  `connector-hub-nachweis-${Date.now()}`,
);
console.error(`Connector-Hub-Nachweis auf Zweig ${zweig.name} (${zweig.id}).`);

const klient = new Client({
  connectionString: zweig.verbindung,
  ssl: { rejectUnauthorized: true },
});
let fehlgeschlagen = false;

try {
  await klient.connect();
  await grundlageAnwenden(klient);

  const geheimeSpalten = await klient.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name in ('connector_verbindungen', 'connector_projekt_werkzeuge')
        and column_name ~* '(token|secret|api_key|refresh)'`,
  );
  if (geheimeSpalten.rows.length !== 0) {
    throw new Error("Connector-Tabellen enthalten unerwartete Secret-Spalten.");
  }

  const db = dbFuer(klient);
  const identitaetA = identitaetNachVerifikation("connector-nutzer-a");
  const identitaetB = identitaetNachVerifikation("connector-nutzer-b");
  const projektId = "projekt-gemeinsam";

  for (const [identitaet, suffix] of [[identitaetA, "a"], [identitaetB, "b"]] as const) {
    await verbindungSpeichern(db, identitaet, verbindung("github", "github", "repo", `firma-${suffix}/repo`));
    await verbindungSpeichern(db, identitaet, verbindung("neon", "neon", "datenbank_projekt", `neon-${suffix}`));
    await verbindungSpeichern(db, identitaet, verbindung("vercel", "vercel", "vercel_projekt", `vercel-${suffix}`));
    await projektWerkzeugeSpeichern(db, identitaet, projektId, werkzeuge(suffix));
  }

  const verbindungenA = await verbindungenLaden(db, identitaetA);
  const verbindungenB = await verbindungenLaden(db, identitaetB);
  if (
    verbindungenA.find((eintrag) => eintrag.id === "github")?.ressourcen[0]?.id !== "firma-a/repo"
    || verbindungenB.find((eintrag) => eintrag.id === "github")?.ressourcen[0]?.id !== "firma-b/repo"
  ) {
    throw new Error("Connector-Verbindungen wurden nicht sauber nach Mandant getrennt.");
  }

  const standA = await projektWerkzeugeLaden(db, identitaetA, projektId);
  const standB = await projektWerkzeugeLaden(db, identitaetB, projektId);
  if (
    standA?.aufgeloest.githubRepo.id !== "firma-a/repo"
    || standB?.aufgeloest.githubRepo.id !== "firma-b/repo"
  ) {
    throw new Error("Resource Picks wurden nicht sauber nach Mandant getrennt.");
  }

  const workerA = await projektWerkzeugeFuerWorkerLaden(db, identitaetA.nutzerId, projektId);
  const workerB = await projektWerkzeugeFuerWorkerLaden(db, identitaetB.nutzerId, projektId);
  if (
    workerA?.aufgeloest.backend.id !== "neon-a"
    || workerB?.aufgeloest.vercelProjekt.id !== "vercel-b"
  ) {
    throw new Error("Der Worker konnte die explizit adressierten Resource Picks nicht lesen.");
  }

  let workerKonnteSchreiben = false;
  try {
    await mitWorkerTransaktion(db, async (tx) => {
      await tx.query(
        "update connector_verbindungen set status = 'getrennt' where nutzer_id = $1 and id = 'github'",
        [identitaetA.nutzerId],
      );
    });
    workerKonnteSchreiben = true;
  } catch {
    workerKonnteSchreiben = false;
  }
  if (workerKonnteSchreiben) {
    throw new Error("byb_worker konnte Connector-Konfiguration verändern.");
  }

  console.error("Geprüft: Connector-Tabellen enthalten keine Token-/Secret-Spalten.");
  console.error("Geprüft: gleiche Connector-/Projekt-IDs bleiben zwischen zwei Mandanten getrennt.");
  console.error("Geprüft: Resource Picks werden gegen eigene verbundene Ressourcen aufgelöst.");
  console.error("Geprüft: byb_worker kann Resource Picks lesen, aber Connector-Daten nicht verändern.");
} catch (fehler) {
  fehlgeschlagen = true;
  console.error(`Connector-Hub-Nachweis abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  await klient.end().catch(() => undefined);
  await zweigLoeschen(projekt.id, schluessel, zweig.id);
  console.error(`Zweig gelöscht: ${zweig.name}`);
}

process.exit(fehlgeschlagen ? 1 : 0);
