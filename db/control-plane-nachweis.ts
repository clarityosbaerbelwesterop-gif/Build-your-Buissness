import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { setTimeout as warten } from "node:timers/promises";

import { Client } from "pg";

import { pflicht } from "../config/umgebung.js";
import {
  LeaseKonfliktFehler,
  aktionMitLeaseAbschliessen,
  auftragLaden,
  auftragSpeichern,
  freigabeSpeichern,
  leaseErneuern,
  naechsteAktionLeasen,
} from "../control-plane/speicher.js";
import { Auftrag, type Auftrag as AuftragTyp } from "../control-plane/v1.js";
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

function verbindungFuer(klient: Client): SqlVerbindung {
  return {
    async query(sql: string, werte: unknown[] = []) {
      const ergebnis = await klient.query(sql, werte);
      return { rows: ergebnis.rows as Record<string, unknown>[] };
    },
  };
}

function auftragA(nutzerId: string): AuftragTyp {
  return Auftrag.parse({
    version: 1,
    id: `auftrag-a-${randomUUID()}`,
    projekt_id: `projekt-${randomUUID()}`,
    nutzer_id: nutzerId,
    ziel: "Baue die Anwendung autonom und dokumentiere jeden ausgeführten Schritt.",
    zustand: "plan_bereit",
    credit_deckel: 100,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: "code",
        typ: "code",
        titel: "Produkt bauen",
        beschreibung: "BYB schreibt und prüft die geplanten Änderungen.",
        zustand: "geplant",
        abhaengigkeiten: [],
        verbindung_ids: ["github-1"],
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 30,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [],
  });
}

function auftragB(nutzerId: string): AuftragTyp {
  return Auftrag.parse({
    version: 1,
    id: `auftrag-b-${randomUUID()}`,
    projekt_id: `projekt-${randomUUID()}`,
    nutzer_id: nutzerId,
    ziel: "Veröffentliche die vorbereitete Fassung erst innerhalb einer erteilten Freigabe.",
    zustand: "wartet_freigabe",
    credit_deckel: 100,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: "deploy",
        typ: "deploy",
        titel: "Produkt veröffentlichen",
        beschreibung: "BYB veröffentlicht die vorbereitete Fassung über Vercel.",
        zustand: "geplant",
        abhaengigkeiten: [],
        verbindung_ids: ["vercel-1"],
        freigabe: { klasse: "extern", status: "offen" },
        credits_geschaetzt: 20,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [],
  });
}

function gleich(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const schluessel = pflicht("NEON_API_KEY", "einen Zweig für den Control-Plane-Nachweis anlegen");
const projekt = await projektWaehlen(schluessel);
const zweig = await zweigAnlegen(
  projekt.id,
  schluessel,
  `control-plane-nachweis-${Date.now()}`,
);
console.error(`Control-Plane-Nachweis auf Zweig ${zweig.name} (${zweig.id}).`);

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
    const spalte = await klient.query<{ vorhanden: boolean }>(
      `select exists (
         select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'protokolle'
            and column_name = 'inhalt'
       ) as vorhanden`,
    );
    if (!spalte.rows[0]?.vorhanden) {
      throw new Error("Vorhandene alte Protokolle blockieren die vorausgesetzte Migration 002.");
    }
  }

  await klient.query(MIGRATION_002);
  await klient.query(MIGRATION_003);

  const rollen = await klient.query<{
    rolcanlogin: boolean;
    rolbypassrls: boolean;
    rolsuper: boolean;
  }>(
    "select rolcanlogin, rolbypassrls, rolsuper from pg_roles where rolname = 'byb_worker'",
  );
  const rolle = rollen.rows[0];
  if (rolle === undefined || rolle.rolcanlogin || rolle.rolbypassrls || rolle.rolsuper) {
    throw new Error("Die Worker-Rolle hat unerwartete Rollenrechte.");
  }

  const db = verbindungFuer(klient);
  const identitaetA = identitaetNachVerifikation("control-plane-nutzer-a");
  const identitaetB = identitaetNachVerifikation("control-plane-nutzer-b");
  const a = auftragA(identitaetA.nutzerId);
  const b = auftragB(identitaetB.nutzerId);

  await auftragSpeichern(db, identitaetA, a);
  await auftragSpeichern(db, identitaetB, b);

  const aEigen = await auftragLaden(db, identitaetA, a.id);
  const bEigen = await auftragLaden(db, identitaetB, b.id);
  const aSiehtB = await auftragLaden(db, identitaetA, b.id);
  const bSiehtA = await auftragLaden(db, identitaetB, a.id);
  if (!gleich(aEigen, a) || !gleich(bEigen, b)) {
    throw new Error("Ein gespeicherter Auftrag kam nicht verlustfrei zurück.");
  }
  if (aSiehtB !== undefined || bSiehtA !== undefined) {
    throw new Error("Die Mandantentrennung der Control Plane wurde verletzt.");
  }

  let workerSahProtokolle = false;
  try {
    await mitWorkerTransaktion(db, async (tx) => {
      await tx.query("select count(*) from protokolle");
    });
    workerSahProtokolle = true;
  } catch {
    workerSahProtokolle = false;
  }
  if (workerSahProtokolle) {
    throw new Error("Die Worker-Rolle darf nicht auf bestehende Protokolle zugreifen.");
  }

  const lease1 = await naechsteAktionLeasen(db, "nachweis-worker", 100, 1_780_000_000_000);
  if (lease1 === undefined || lease1.auftragId !== a.id || lease1.aktionId !== "code") {
    throw new Error("Die erste autonome Aktion wurde nicht korrekt geleast.");
  }

  const waehrendAktiverLease = await naechsteAktionLeasen(
    db,
    "nachweis-worker-2",
    100,
    1_780_000_000_010,
  );
  if (waehrendAktiverLease !== undefined) {
    throw new Error("Eine aktive Lease wurde doppelt vergeben oder eine Freigabegrenze ignoriert.");
  }

  await warten(160);
  const lease2 = await naechsteAktionLeasen(
    db,
    "nachweis-worker-2",
    5_000,
    1_780_000_000_200,
  );
  if (
    lease2 === undefined
    || lease2.auftragId !== a.id
    || lease2.aktionId !== "code"
    || lease2.leaseToken === lease1.leaseToken
    || lease2.versuch !== 2
  ) {
    throw new Error("Eine abgelaufene Lease wurde nicht sauber neu vergeben.");
  }

  let alterWorkerAbgewiesen = false;
  try {
    await aktionMitLeaseAbschliessen(
      db,
      a.id,
      "code",
      lease1.leaseToken,
      "Dieser alte Worker darf nicht mehr schreiben.",
      1,
      1_780_000_000_210,
    );
  } catch (fehler) {
    alterWorkerAbgewiesen = fehler instanceof LeaseKonfliktFehler;
  }
  if (!alterWorkerAbgewiesen) {
    throw new Error("Ein alter Worker konnte nach Re-Lease noch abschließen.");
  }

  await leaseErneuern(db, a.id, "code", lease2.leaseToken, 5_000);
  const aFertig = await aktionMitLeaseAbschliessen(
    db,
    a.id,
    "code",
    lease2.leaseToken,
    "Code und Tests abgeschlossen.",
    24,
    1_780_000_000_220,
  );
  if (aFertig.zustand !== "abgeschlossen" || aFertig.credits_verbraucht !== 24) {
    throw new Error("Der geleaste Auftrag wurde nicht atomar abgeschlossen.");
  }

  const bFreigegeben = await freigabeSpeichern(
    db,
    identitaetB,
    b.id,
    "deploy",
    "deploy-nachweis",
    1_780_000_000_300,
  );
  if (bFreigegeben.zustand !== "laeuft") {
    throw new Error("Eine erteilte Freigabe hat den Auftrag nicht freigeschaltet.");
  }

  const leaseB = await naechsteAktionLeasen(
    db,
    "nachweis-worker",
    5_000,
    1_780_000_000_310,
  );
  if (leaseB === undefined || leaseB.auftragId !== b.id || leaseB.aktionId !== "deploy") {
    throw new Error("Die freigegebene externe Aktion wurde nicht geleast.");
  }
  await aktionMitLeaseAbschliessen(
    db,
    b.id,
    "deploy",
    leaseB.leaseToken,
    "Deployment-Nachweis abgeschlossen.",
    18,
    1_780_000_000_320,
  );

  const aNachher = await auftragLaden(db, identitaetA, a.id);
  const bNachher = await auftragLaden(db, identitaetB, b.id);
  if (aNachher?.zustand !== "abgeschlossen" || bNachher?.zustand !== "abgeschlossen") {
    throw new Error("Die finalen Auftragszustände wurden nicht persistent gespeichert.");
  }
  if (aNachher.ereignisse.length !== 3) {
    throw new Error("Start, Wiederaufnahme und Abschluss sind nicht vollständig dokumentiert.");
  }

  console.error("Geprüft: zwei Mandanten speichern und lesen nur eigene Aufträge.");
  console.error("Geprüft: byb_worker ist NOLOGIN/NOBYPASSRLS und sieht keine Protokolle.");
  console.error("Geprüft: aktive Leases werden nicht doppelt vergeben.");
  console.error("Geprüft: abgelaufene Lease wird mit neuem Token wieder aufgenommen.");
  console.error("Geprüft: alter Worker-Token kann danach nicht mehr abschließen.");
  console.error("Geprüft: Freigabe, Lease-Erneuerung, Abschluss und Credits bleiben persistent.");
} catch (fehler) {
  fehlgeschlagen = true;
  console.error(`Control-Plane-Nachweis abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  await klient.end().catch(() => undefined);
  await zweigLoeschen(projekt.id, schluessel, zweig.id);
  console.error(`Zweig gelöscht: ${zweig.name}`);
}

process.exit(fehlgeschlagen ? 1 : 0);
