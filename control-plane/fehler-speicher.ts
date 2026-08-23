import { z } from "zod";

import { Auftrag, type Auftrag as AuftragTyp, type Ereignis } from "./v1.js";
import { aktionEndgueltigFehlschlagen, aktionZurWiederholungPlanen } from "./fehler.js";
import type { SqlVerbindung } from "../db/auth-kontext.js";
import { mitWorkerTransaktion } from "../db/worker-kontext.js";
import { LeaseKonfliktFehler } from "./speicher.js";

const Kennung = z.string().trim().min(1).max(200);
const Fehlertext = z.string().trim().min(3).max(300);
const MaxVersuche = z.number().int().min(1).max(20);
const Zeile = z.object({
  nutzer_id: z.string().min(1),
  inhalt: z.unknown(),
  versuche: z.number().int().min(1),
});

export interface LeaseFehlerErgebnis {
  readonly auftrag: AuftragTyp;
  readonly wiederholen: boolean;
  readonly versuch: number;
}

function json(wert: unknown): string {
  return JSON.stringify(wert);
}

function aktionAus(auftrag: AuftragTyp, aktionId: string) {
  const aktion = auftrag.aktionen.find((eintrag) => eintrag.id === aktionId);
  if (aktion === undefined) throw new Error(`Unbekannte Aktion: ${aktionId}`);
  return aktion;
}

function neuesEreignis(vorher: AuftragTyp, nachher: AuftragTyp): Ereignis {
  const bekannte = new Set(vorher.ereignisse.map((ereignis) => ereignis.id));
  const neue = nachher.ereignisse.filter((ereignis) => !bekannte.has(ereignis.id));
  if (neue.length !== 1 || neue[0] === undefined) {
    throw new Error("Fehlerübergang muss genau ein Activity-Log-Ereignis erzeugen.");
  }
  return neue[0];
}

export async function aktionMitLeaseFehlerSpeichern(
  verbindung: SqlVerbindung,
  auftragIdRoh: string,
  aktionIdRoh: string,
  leaseTokenRoh: string,
  fehlerTextRoh: string,
  maxVersucheRoh: number,
  zeitstempel: number,
): Promise<LeaseFehlerErgebnis> {
  const auftragId = Kennung.parse(auftragIdRoh);
  const aktionId = Kennung.parse(aktionIdRoh);
  const leaseToken = z.string().uuid().parse(leaseTokenRoh);
  const fehlerText = Fehlertext.parse(fehlerTextRoh);
  const maxVersuche = MaxVersuche.parse(maxVersucheRoh);

  return mitWorkerTransaktion(verbindung, async (db) => {
    const gelesen = await db.query(
      `select a.nutzer_id, a.inhalt, x.versuche
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
    const roh = gelesen.rows[0];
    if (roh === undefined) throw new LeaseKonfliktFehler();
    const zeile = Zeile.parse(roh);
    const vorher = Auftrag.parse(zeile.inhalt);
    if (vorher.nutzer_id !== zeile.nutzer_id) {
      throw new Error("Gespeicherter Auftrag und Mandantenprojektion widersprechen sich.");
    }

    const wiederholen = zeile.versuche < maxVersuche;
    const nachher = wiederholen
      ? aktionZurWiederholungPlanen(
          vorher,
          aktionId,
          fehlerText,
          zeile.versuche,
          maxVersuche,
          zeitstempel,
        )
      : aktionEndgueltigFehlschlagen(
          vorher,
          aktionId,
          fehlerText,
          zeile.versuche,
          maxVersuche,
          zeitstempel,
        );
    const aktion = aktionAus(nachher, aktionId);
    const ereignis = neuesEreignis(vorher, nachher);

    const auftragAktualisiert = await db.query(
      `update steuer_auftraege set
         zustand = $2,
         inhalt = $3::jsonb,
         revision = revision + 1,
         aktualisiert = now()
       where id = $1
       returning id`,
      [auftragId, nachher.zustand, json(nachher)],
    );
    if (auftragAktualisiert.rows.length !== 1) throw new LeaseKonfliktFehler();

    const aktionAktualisiert = await db.query(
      `update steuer_aktionen set
         zustand = $4,
         credits_verbraucht = $5,
         inhalt = $6::jsonb,
         lease_token = null,
         lease_bis = null,
         lease_owner = null,
         aktualisiert = now()
       where auftrag_id = $1
         and aktion_id = $2
         and lease_token = $3::uuid
       returning aktion_id`,
      [
        auftragId,
        aktionId,
        leaseToken,
        aktion.zustand,
        aktion.credits_verbraucht,
        json(aktion),
      ],
    );
    if (aktionAktualisiert.rows.length !== 1) throw new LeaseKonfliktFehler();

    await db.query(
      `insert into steuer_ereignisse
         (auftrag_id, ereignis_id, nutzer_id, typ, aktion_id, zeitstempel, inhalt)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        auftragId,
        ereignis.id,
        nachher.nutzer_id,
        ereignis.typ,
        ereignis.aktion_id ?? null,
        ereignis.zeitstempel,
        json(ereignis),
      ],
    );

    return {
      auftrag: nachher,
      wiederholen,
      versuch: zeile.versuche,
    };
  });
}
