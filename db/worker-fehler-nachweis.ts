import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { pflicht } from "../config/umgebung.js";
import { aktionMitLeaseFehlerSpeichern } from "../control-plane/fehler-speicher.js";
import { auftragLaden, auftragSpeichern, naechsteAktionLeasen } from "../control-plane/speicher.js";
import { Auftrag } from "../control-plane/v1.js";
import { identitaetNachVerifikation, type SqlVerbindung } from "./auth-kontext.js";
import { entschaerfen } from "./entschaerfen.js";
import { projektWaehlen, zweigAnlegen, zweigLoeschen } from "./neon-api.js";

const MIGRATION_002 = readFileSync(
  fileURLToPath(new URL("./002_protokoll_inhalt.sql", import.meta.url)),
  "utf8",
);
const MIGRATION_003 = readFileSync(
  fileURLToPath(new URL("./003_control_plane.sql", import.meta.url)),
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

const schluessel = pflicht("NEON_API_KEY", "einen Zweig für den Worker-Fehlernachweis anlegen");
const projekt = await projektWaehlen(schluessel);
const zweig = await zweigAnlegen(
  projekt.id,
  schluessel,
  `worker-fehler-nachweis-${Date.now()}`,
);
console.error(`Worker-Fehlernachweis auf Zweig ${zweig.name} (${zweig.id}).`);

const klient = new Client({
  connectionString: zweig.verbindung,
  ssl: { rejectUnauthorized: true },
});
let fehlgeschlagen = false;

try {
  await klient.connect();
  await klient.query(MIGRATION_002);
  await klient.query(MIGRATION_003);

  const db = verbindungFuer(klient);
  const identitaet = identitaetNachVerifikation(`worker-fehler-${randomUUID()}`);
  const auftrag = Auftrag.parse({
    version: 1,
    id: `auftrag-fehler-${randomUUID()}`,
    projekt_id: `projekt-${randomUUID()}`,
    nutzer_id: identitaet.nutzerId,
    ziel: "Behandle einen wiederholt fehlschlagenden Provider-Aufruf begrenzt und nachvollziehbar.",
    zustand: "plan_bereit",
    credit_deckel: 20,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: "repo-fehler",
        typ: "repo",
        titel: "Repo-Verbindung prüfen",
        beschreibung: "BYB begrenzt Wiederholungen eines fehlgeschlagenen Provider-Aufrufs.",
        zustand: "geplant",
        abhaengigkeiten: [],
        verbindung_ids: ["github-1"],
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 2,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [],
  });
  await auftragSpeichern(db, identitaet, auftrag);

  for (const versuch of [1, 2, 3] as const) {
    const lease = await naechsteAktionLeasen(
      db,
      `fehler-worker-${versuch}`,
      5_000,
      1_780_000_001_000 + versuch * 10,
      ["repo"],
    );
    if (
      lease === undefined
      || lease.auftragId !== auftrag.id
      || lease.aktionId !== "repo-fehler"
      || lease.versuch !== versuch
    ) {
      throw new Error(`Fehlversuch ${versuch} wurde nicht korrekt geleast.`);
    }

    const ergebnis = await aktionMitLeaseFehlerSpeichern(
      db,
      auftrag.id,
      "repo-fehler",
      lease.leaseToken,
      "Provider-Aufruf blieb für den Nachweis kontrolliert erfolglos.",
      3,
      1_780_000_001_001 + versuch * 10,
    );

    if (versuch < 3) {
      if (
        !ergebnis.wiederholen
        || ergebnis.auftrag.zustand !== "laeuft"
        || ergebnis.auftrag.aktionen[0]?.zustand !== "geplant"
      ) {
        throw new Error(`Fehlversuch ${versuch} wurde nicht begrenzt wieder eingeplant.`);
      }
    } else if (
      ergebnis.wiederholen
      || ergebnis.auftrag.zustand !== "fehlgeschlagen"
      || ergebnis.auftrag.aktionen[0]?.zustand !== "fehlgeschlagen"
    ) {
      throw new Error("Der dritte Fehlversuch wurde nicht terminal gespeichert.");
    }
  }

  const gespeichert = await auftragLaden(db, identitaet, auftrag.id);
  if (
    gespeichert?.zustand !== "fehlgeschlagen"
    || gespeichert.aktionen[0]?.zustand !== "fehlgeschlagen"
    || gespeichert.ereignisse.filter((ereignis) => ereignis.typ === "plan_geaendert").length !== 2
    || gespeichert.ereignisse.filter((ereignis) => ereignis.typ === "aktion_fehlgeschlagen").length !== 1
  ) {
    throw new Error("Retry- und terminaler Fehlerzustand wurden nicht vollständig gespeichert.");
  }

  const projektion = await klient.query<{
    zustand: string;
    versuche: number;
    lease_frei: boolean;
  }>(
    `select zustand, versuche, lease_token is null and lease_bis is null and lease_owner is null as lease_frei
       from steuer_aktionen
      where auftrag_id = $1 and aktion_id = 'repo-fehler'`,
    [auftrag.id],
  );
  const zeile = projektion.rows[0];
  if (
    zeile === undefined
    || zeile.zustand !== "fehlgeschlagen"
    || zeile.versuche !== 3
    || !zeile.lease_frei
  ) {
    throw new Error("Terminale Projektion oder Lease-Bereinigung ist inkonsistent.");
  }

  console.error("Geprüft: Fehlversuch 1 und 2 werden persistent wieder eingeplant.");
  console.error("Geprüft: Fehlversuch 3 endet persistent und räumt die Lease auf.");
} catch (fehler) {
  fehlgeschlagen = true;
  console.error(`Worker-Fehlernachweis abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  await klient.end().catch(() => undefined);
  await zweigLoeschen(projekt.id, schluessel, zweig.id);
  console.error(`Zweig gelöscht: ${zweig.name}`);
}

process.exit(fehlgeschlagen ? 1 : 0);
