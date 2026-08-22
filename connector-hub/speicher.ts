import { z } from "zod";

import {
  ConnectorVerbindung,
  UnternehmensWerkzeuge,
  werkzeugeAufloesen,
  type AufgeloesteWerkzeuge,
  type ConnectorVerbindung as ConnectorVerbindungTyp,
  type UnternehmensWerkzeuge as UnternehmensWerkzeugeTyp,
} from "./v1.js";
import {
  mitNutzerTransaktion,
  type SqlVerbindung,
  type VerifizierteIdentitaet,
} from "../db/auth-kontext.js";
import { mitWorkerTransaktion } from "../db/worker-kontext.js";

const ProjektId = z.string().trim().min(1).max(120);
const NutzerId = z.string().trim().min(1).max(300);

const VerbindungsZeile = z.object({ inhalt: z.unknown() });
const WerkzeugeZeile = z.object({ inhalt: z.unknown() });

export interface ProjektWerkzeugeStand {
  readonly auswahl: UnternehmensWerkzeugeTyp;
  readonly aufgeloest: AufgeloesteWerkzeuge;
}

function json(wert: unknown): string {
  return JSON.stringify(wert);
}

async function verbindungenLadenInTransaktion(
  db: SqlVerbindung,
  nutzerId?: string,
): Promise<ConnectorVerbindungTyp[]> {
  const ergebnis = nutzerId === undefined
    ? await db.query(
        `select inhalt
           from connector_verbindungen
          order by anbieter asc, id asc`,
      )
    : await db.query(
        `select inhalt
           from connector_verbindungen
          where nutzer_id = $1
          order by anbieter asc, id asc`,
        [NutzerId.parse(nutzerId)],
      );

  return ergebnis.rows.map((roh) => ConnectorVerbindung.parse(VerbindungsZeile.parse(roh).inhalt));
}

async function projektWerkzeugeLadenInTransaktion(
  db: SqlVerbindung,
  projektIdRoh: string,
  nutzerId?: string,
): Promise<UnternehmensWerkzeugeTyp | undefined> {
  const projektId = ProjektId.parse(projektIdRoh);
  const ergebnis = nutzerId === undefined
    ? await db.query(
        `select inhalt
           from connector_projekt_werkzeuge
          where projekt_id = $1`,
        [projektId],
      )
    : await db.query(
        `select inhalt
           from connector_projekt_werkzeuge
          where nutzer_id = $1 and projekt_id = $2`,
        [NutzerId.parse(nutzerId), projektId],
      );

  const roh = ergebnis.rows[0];
  if (roh === undefined) return undefined;
  return UnternehmensWerkzeuge.parse(WerkzeugeZeile.parse(roh).inhalt);
}

export async function verbindungSpeichern(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  roh: ConnectorVerbindungTyp,
): Promise<ConnectorVerbindungTyp> {
  const eintrag = ConnectorVerbindung.parse(roh);
  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    await db.query(
      `insert into connector_verbindungen
         (nutzer_id, id, version, anbieter, konto_ref, status, inhalt)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)
       on conflict (nutzer_id, id) do update set
         version = excluded.version,
         anbieter = excluded.anbieter,
         konto_ref = excluded.konto_ref,
         status = excluded.status,
         inhalt = excluded.inhalt,
         aktualisiert = now()`,
      [
        identitaet.nutzerId,
        eintrag.id,
        eintrag.version,
        eintrag.anbieter,
        eintrag.konto_ref,
        eintrag.status,
        json(eintrag),
      ],
    );
    return eintrag;
  });
}

export async function verbindungenLaden(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
): Promise<ConnectorVerbindungTyp[]> {
  return mitNutzerTransaktion(verbindung, identitaet, (db) => verbindungenLadenInTransaktion(db));
}

export async function projektWerkzeugeSpeichern(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  projektIdRoh: string,
  roh: UnternehmensWerkzeugeTyp,
): Promise<ProjektWerkzeugeStand> {
  const projektId = ProjektId.parse(projektIdRoh);
  const auswahl = UnternehmensWerkzeuge.parse(roh);

  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    const verbindungen = await verbindungenLadenInTransaktion(db);
    const aufgeloest = werkzeugeAufloesen(verbindungen, auswahl);
    await db.query(
      `insert into connector_projekt_werkzeuge
         (nutzer_id, projekt_id, version, inhalt)
       values ($1, $2, $3, $4::jsonb)
       on conflict (nutzer_id, projekt_id) do update set
         version = excluded.version,
         inhalt = excluded.inhalt,
         revision = connector_projekt_werkzeuge.revision + 1,
         aktualisiert = now()`,
      [identitaet.nutzerId, projektId, 1, json(auswahl)],
    );
    return { auswahl, aufgeloest };
  });
}

export async function projektWerkzeugeLaden(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  projektId: string,
): Promise<ProjektWerkzeugeStand | undefined> {
  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    const auswahl = await projektWerkzeugeLadenInTransaktion(db, projektId);
    if (auswahl === undefined) return undefined;
    const verbindungen = await verbindungenLadenInTransaktion(db);
    return { auswahl, aufgeloest: werkzeugeAufloesen(verbindungen, auswahl) };
  });
}

export async function projektWerkzeugeFuerWorkerLaden(
  verbindung: SqlVerbindung,
  nutzerIdRoh: string,
  projektIdRoh: string,
): Promise<ProjektWerkzeugeStand | undefined> {
  const nutzerId = NutzerId.parse(nutzerIdRoh);
  const projektId = ProjektId.parse(projektIdRoh);
  return mitWorkerTransaktion(verbindung, async (db) => {
    const auswahl = await projektWerkzeugeLadenInTransaktion(db, projektId, nutzerId);
    if (auswahl === undefined) return undefined;
    const verbindungen = await verbindungenLadenInTransaktion(db, nutzerId);
    return { auswahl, aufgeloest: werkzeugeAufloesen(verbindungen, auswahl) };
  });
}
