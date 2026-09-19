import { z } from "zod";

import {
  mitNutzerTransaktion,
  type SqlVerbindung,
  type VerifizierteIdentitaet,
} from "../db/auth-kontext.js";
import { Auftrag, type Auftrag as AuftragTyp } from "../control-plane/v1.js";
import { SURFACE_PROJEKT_ID } from "./v1.js";

const AuftragZeile = z.object({ inhalt: z.unknown() });

export async function surfaceAuftragLaden(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
): Promise<AuftragTyp | undefined> {
  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    const ergebnis = await db.query(
      `select inhalt
         from steuer_auftraege
        where projekt_id = $1
        order by erstellt desc, id desc
        limit 1`,
      [SURFACE_PROJEKT_ID],
    );
    const roh = ergebnis.rows[0];
    if (roh === undefined) return undefined;
    return Auftrag.parse(AuftragZeile.parse(roh).inhalt);
  });
}

export async function surfaceLeadsZaehlen(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  auftragId: string,
): Promise<number | undefined> {
  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    try {
      const ergebnis = await db.query(
        `select count(*)::int as anzahl
           from surface_leads
          where auftrag_id = $1`,
        [auftragId],
      );
      const anzahl = ergebnis.rows[0]?.["anzahl"];
      return typeof anzahl === "number" ? anzahl : 0;
    } catch {
      return undefined;
    }
  });
}

export async function surfaceLeadSpeichern(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  eingabe: {
    readonly id: string;
    readonly auftragId: string;
    readonly name: string;
    readonly email: string;
    readonly nachricht: string;
  },
): Promise<void> {
  await mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    const auftrag = await db.query(
      `select id from steuer_auftraege where id = $1 and projekt_id = $2`,
      [eingabe.auftragId, SURFACE_PROJEKT_ID],
    );
    if (auftrag.rows.length !== 1) {
      throw new Error("SURFACE_AUFTRAG_FEHLT");
    }
    await db.query(
      `insert into surface_leads
         (id, nutzer_id, auftrag_id, name, email, nachricht)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        eingabe.id,
        identitaet.nutzerId,
        eingabe.auftragId,
        eingabe.name,
        eingabe.email,
        eingabe.nachricht,
      ],
    );
  });
}
