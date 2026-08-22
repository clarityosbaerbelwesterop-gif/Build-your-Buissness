import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  Aktion,
  Auftrag,
  aktionAbschliessen,
  aktionStarten,
  freigabeErteilen,
  naechsteAktionen,
  type Auftrag as AuftragTyp,
  type Ereignis,
} from "./v1.js";
import {
  mitNutzerTransaktion,
  type SqlVerbindung,
  type VerifizierteIdentitaet,
} from "../db/auth-kontext.js";
import { mitWorkerTransaktion } from "../db/worker-kontext.js";

const Kennung = z.string().trim().min(1).max(200);
const LeaseDauer = z.number().int().min(100).max(15 * 60 * 1000);

const AuftragZeile = z.object({
  inhalt: z.unknown(),
  nutzer_id: z.string(),
});

const AktionsIdZeile = z.object({ aktion_id: z.string() });
const LeaseZeile = z.object({
  lease_token: z.string().uuid(),
  lease_bis_ms: z.string().regex(/^\d+$/),
  versuche: z.number().int().min(1),
});

export interface AktionsLease {
  readonly auftragId: string;
  readonly aktionId: string;
  readonly nutzerId: string;
  readonly leaseToken: string;
  readonly leaseBisMs: number;
  readonly versuch: number;
  readonly aktion: Aktion;
}

export class LeaseKonfliktFehler extends Error {
  constructor() {
    super("Die Aktion besitzt keine aktive Lease für diesen Worker.");
    this.name = "LeaseKonfliktFehler";
  }
}

function json(wert: unknown): string {
  return JSON.stringify(wert);
}

function aktionAus(auftrag: AuftragTyp, aktionId: string): Aktion {
  const aktion = auftrag.aktionen.find((eintrag) => eintrag.id === aktionId);
  if (aktion === undefined) throw new Error(`Unbekannte Aktion: ${aktionId}`);
  return aktion;
}

async function ereignisEinfuegen(
  db: SqlVerbindung,
  auftrag: AuftragTyp,
  ereignis: Ereignis,
): Promise<void> {
  await db.query(
    `insert into steuer_ereignisse
       (auftrag_id, ereignis_id, nutzer_id, typ, aktion_id, zeitstempel, inhalt)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (auftrag_id, ereignis_id) do nothing`,
    [
      auftrag.id,
      ereignis.id,
      auftrag.nutzer_id,
      ereignis.typ,
      ereignis.aktion_id ?? null,
      ereignis.zeitstempel,
      json(ereignis),
    ],
  );
}

async function aktionProjizieren(
  db: SqlVerbindung,
  auftrag: AuftragTyp,
  aktion: Aktion,
): Promise<void> {
  await db.query(
    `insert into steuer_aktionen
       (auftrag_id, aktion_id, nutzer_id, typ, zustand, freigabe_klasse,
        freigabe_status, credits_geschaetzt, credits_verbraucht, inhalt)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     on conflict (auftrag_id, aktion_id) do update set
       typ = excluded.typ,
       zustand = excluded.zustand,
       freigabe_klasse = excluded.freigabe_klasse,
       freigabe_status = excluded.freigabe_status,
       credits_geschaetzt = excluded.credits_geschaetzt,
       credits_verbraucht = excluded.credits_verbraucht,
       inhalt = excluded.inhalt,
       aktualisiert = now()`,
    [
      auftrag.id,
      aktion.id,
      auftrag.nutzer_id,
      aktion.typ,
      aktion.zustand,
      aktion.freigabe.klasse,
      aktion.freigabe.status,
      aktion.credits_geschaetzt,
      aktion.credits_verbraucht,
      json(aktion),
    ],
  );
}

async function aggregateAktualisieren(
  db: SqlVerbindung,
  vorher: AuftragTyp,
  nachher: AuftragTyp,
): Promise<void> {
  const aktualisiert = await db.query(
    `update steuer_auftraege set
       zustand = $2,
       credit_deckel = $3,
       credits_verbraucht = $4,
       inhalt = $5::jsonb,
       revision = revision + 1,
       aktualisiert = now()
     where id = $1
     returning id`,
    [
      nachher.id,
      nachher.zustand,
      nachher.credit_deckel,
      nachher.credits_verbraucht,
      json(nachher),
    ],
  );
  if (aktualisiert.rows.length !== 1) {
    throw new Error(`Auftrag konnte nicht aktualisiert werden: ${nachher.id}`);
  }

  for (const aktion of nachher.aktionen) {
    await aktionProjizieren(db, nachher, aktion);
  }

  const bekannteEreignisse = new Set(vorher.ereignisse.map((ereignis) => ereignis.id));
  for (const ereignis of nachher.ereignisse) {
    if (!bekannteEreignisse.has(ereignis.id)) {
      await ereignisEinfuegen(db, nachher, ereignis);
    }
  }
}

async function auftragLadenInTransaktion(
  db: SqlVerbindung,
  auftragId: string,
  sperren = false,
): Promise<AuftragTyp | undefined> {
  const ergebnis = await db.query(
    `select nutzer_id, inhalt
       from steuer_auftraege
      where id = $1${sperren ? " for update" : ""}`,
    [auftragId],
  );
  const roh = ergebnis.rows[0];
  if (roh === undefined) return undefined;
  const zeile = AuftragZeile.parse(roh);
  const auftrag = Auftrag.parse(zeile.inhalt);
  if (auftrag.nutzer_id !== zeile.nutzer_id) {
    throw new Error("Gespeicherter Auftrag und Mandantenprojektion widersprechen sich.");
  }
  return auftrag;
}

export async function auftragSpeichern(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  roh: AuftragTyp,
): Promise<AuftragTyp> {
  const auftrag = Auftrag.parse(roh);
  if (auftrag.nutzer_id !== identitaet.nutzerId) {
    throw new Error("Ein Auftrag darf nur für die verifizierte Nutzerkennung gespeichert werden.");
  }

  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    await db.query(
      `insert into steuer_auftraege
         (id, nutzer_id, projekt_id, version, zustand, credit_deckel,
          credits_verbraucht, inhalt)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        auftrag.id,
        auftrag.nutzer_id,
        auftrag.projekt_id,
        auftrag.version,
        auftrag.zustand,
        auftrag.credit_deckel,
        auftrag.credits_verbraucht,
        json(auftrag),
      ],
    );

    for (const aktion of auftrag.aktionen) await aktionProjizieren(db, auftrag, aktion);
    for (const ereignis of auftrag.ereignisse) await ereignisEinfuegen(db, auftrag, ereignis);
    return auftrag;
  });
}

export async function auftragLaden(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  auftragId: string,
): Promise<AuftragTyp | undefined> {
  return mitNutzerTransaktion(
    verbindung,
    identitaet,
    (db) => auftragLadenInTransaktion(db, auftragId),
  );
}

export async function freigabeSpeichern(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  auftragId: string,
  aktionId: string,
  rahmenId: string,
  zeitstempel: number,
): Promise<AuftragTyp> {
  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    const vorher = await auftragLadenInTransaktion(db, auftragId, true);
    if (vorher === undefined) throw new Error(`Auftrag nicht gefunden: ${auftragId}`);
    const nachher = freigabeErteilen(vorher, aktionId, rahmenId, zeitstempel);
    await aggregateAktualisieren(db, vorher, nachher);
    return nachher;
  });
}

function wiederaufnahmeEreignis(
  auftrag: AuftragTyp,
  aktionId: string,
  zeitstempel: number,
): AuftragTyp {
  const aktion = aktionAus(auftrag, aktionId);
  if (aktion.zustand !== "laeuft") {
    throw new Error("Nur eine laufende Aktion kann nach Lease-Ablauf wieder aufgenommen werden.");
  }
  const ereignis: Ereignis = {
    id: `${auftrag.id}-${auftrag.ereignisse.length + 1}-${zeitstempel}`,
    typ: "aktion_gestartet",
    zeitstempel,
    klartext: `BYB übernimmt „${aktion.titel}“ nach abgelaufener Worker-Lease erneut.`,
    aktion_id: aktionId,
  };
  return Auftrag.parse({
    ...auftrag,
    ereignisse: [...auftrag.ereignisse, ereignis],
  });
}

async function leaseSetzen(
  db: SqlVerbindung,
  auftrag: AuftragTyp,
  aktionId: string,
  workerId: string,
  leaseDauerMs: number,
  wiederaufnahme: boolean,
): Promise<AktionsLease> {
  const leaseToken = randomUUID();
  const bedingung = wiederaufnahme
    ? "zustand = 'laeuft' and lease_bis <= now()"
    : "zustand = 'laeuft' and lease_token is null";
  const ergebnis = await db.query(
    `update steuer_aktionen set
       lease_token = $3::uuid,
       lease_bis = now() + ($4::bigint * interval '1 millisecond'),
       lease_owner = $5,
       versuche = versuche + 1,
       aktualisiert = now()
     where auftrag_id = $1 and aktion_id = $2 and ${bedingung}
     returning lease_token::text as lease_token,
       floor(extract(epoch from lease_bis) * 1000)::bigint::text as lease_bis_ms,
       versuche`,
    [auftrag.id, aktionId, leaseToken, leaseDauerMs, workerId],
  );
  const roh = ergebnis.rows[0];
  if (roh === undefined) throw new LeaseKonfliktFehler();
  const zeile = LeaseZeile.parse(roh);
  return {
    auftragId: auftrag.id,
    aktionId,
    nutzerId: auftrag.nutzer_id,
    leaseToken: zeile.lease_token,
    leaseBisMs: Number(zeile.lease_bis_ms),
    versuch: zeile.versuche,
    aktion: aktionAus(auftrag, aktionId),
  };
}

export async function naechsteAktionLeasen(
  verbindung: SqlVerbindung,
  workerIdRoh: string,
  leaseDauerMsRoh = 60_000,
  zeitstempel = Date.now(),
): Promise<AktionsLease | undefined> {
  const workerId = Kennung.parse(workerIdRoh);
  const leaseDauerMs = LeaseDauer.parse(leaseDauerMsRoh);

  return mitWorkerTransaktion(verbindung, async (db) => {
    const kandidaten = await db.query(
      `select id, nutzer_id, inhalt
         from steuer_auftraege
        where zustand in ('plan_bereit', 'laeuft')
        order by aktualisiert asc
        for update skip locked
        limit 20`,
    );

    for (const roh of kandidaten.rows) {
      const zeile = AuftragZeile.parse(roh);
      const vorher = Auftrag.parse(zeile.inhalt);

      const abgelaufen = await db.query(
        `select aktion_id
           from steuer_aktionen
          where auftrag_id = $1
            and zustand = 'laeuft'
            and lease_bis is not null
            and lease_bis <= now()
          order by aktualisiert asc
          limit 1`,
        [vorher.id],
      );
      const abgelaufeneZeile = abgelaufen.rows[0];

      if (abgelaufeneZeile !== undefined) {
        const aktionId = AktionsIdZeile.parse(abgelaufeneZeile).aktion_id;
        const nachher = wiederaufnahmeEreignis(vorher, aktionId, zeitstempel);
        await aggregateAktualisieren(db, vorher, nachher);
        return leaseSetzen(db, nachher, aktionId, workerId, leaseDauerMs, true);
      }

      const naechste = naechsteAktionen(vorher)[0];
      if (naechste === undefined) continue;
      const nachher = aktionStarten(vorher, naechste.id, zeitstempel);
      await aggregateAktualisieren(db, vorher, nachher);
      return leaseSetzen(db, nachher, naechste.id, workerId, leaseDauerMs, false);
    }

    return undefined;
  });
}

export async function leaseErneuern(
  verbindung: SqlVerbindung,
  auftragId: string,
  aktionId: string,
  leaseToken: string,
  leaseDauerMsRoh = 60_000,
): Promise<number> {
  const leaseDauerMs = LeaseDauer.parse(leaseDauerMsRoh);
  return mitWorkerTransaktion(verbindung, async (db) => {
    const ergebnis = await db.query(
      `update steuer_aktionen set
         lease_bis = now() + ($4::bigint * interval '1 millisecond'),
         aktualisiert = now()
       where auftrag_id = $1
         and aktion_id = $2
         and lease_token = $3::uuid
         and zustand = 'laeuft'
         and lease_bis > now()
       returning floor(extract(epoch from lease_bis) * 1000)::bigint::text as lease_bis_ms`,
      [auftragId, aktionId, leaseToken, leaseDauerMs],
    );
    const roh = ergebnis.rows[0];
    if (roh === undefined) throw new LeaseKonfliktFehler();
    const wert = z.object({ lease_bis_ms: z.string().regex(/^\d+$/) }).parse(roh);
    return Number(wert.lease_bis_ms);
  });
}

export async function aktionMitLeaseAbschliessen(
  verbindung: SqlVerbindung,
  auftragId: string,
  aktionId: string,
  leaseToken: string,
  ergebnisText: string,
  creditsVerbraucht: number,
  zeitstempel: number,
): Promise<AuftragTyp> {
  return mitWorkerTransaktion(verbindung, async (db) => {
    const ergebnis = await db.query(
      `select a.nutzer_id, a.inhalt
         from steuer_auftraege a
         join steuer_aktionen x
           on x.auftrag_id = a.id and x.aktion_id = $2
        where a.id = $1
          and x.lease_token = $3::uuid
          and x.zustand = 'laeuft'
          and x.lease_bis > now()
        for update of a, x`,
      [auftragId, aktionId, leaseToken],
    );
    const roh = ergebnis.rows[0];
    if (roh === undefined) throw new LeaseKonfliktFehler();
    const vorher = Auftrag.parse(AuftragZeile.parse(roh).inhalt);
    const nachher = aktionAbschliessen(
      vorher,
      aktionId,
      ergebnisText,
      creditsVerbraucht,
      zeitstempel,
    );
    await aggregateAktualisieren(db, vorher, nachher);

    const freigegeben = await db.query(
      `update steuer_aktionen set
         lease_token = null,
         lease_bis = null,
         lease_owner = null,
         aktualisiert = now()
       where auftrag_id = $1 and aktion_id = $2 and lease_token = $3::uuid
       returning aktion_id`,
      [auftragId, aktionId, leaseToken],
    );
    if (freigegeben.rows.length !== 1) throw new LeaseKonfliktFehler();
    return nachher;
  });
}
