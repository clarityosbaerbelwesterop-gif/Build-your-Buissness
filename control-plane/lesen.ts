import { z } from "zod";

import {
  mitNutzerTransaktion,
  type SqlVerbindung,
  type VerifizierteIdentitaet,
} from "../db/auth-kontext.js";
import { Auftrag, type Auftrag as AuftragTyp } from "./v1.js";

const Limit = z.number().int().min(1).max(50);
const AuftragZeile = z.object({ inhalt: z.unknown() });

export async function auftraegeLaden(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  limitRoh = 10,
): Promise<AuftragTyp[]> {
  const limit = Limit.parse(limitRoh);
  return mitNutzerTransaktion(verbindung, identitaet, async (db) => {
    const ergebnis = await db.query(
      `select inhalt
         from steuer_auftraege
        order by erstellt desc, id desc
        limit $1`,
      [limit],
    );
    return ergebnis.rows.map((roh) => Auftrag.parse(AuftragZeile.parse(roh).inhalt));
  });
}
