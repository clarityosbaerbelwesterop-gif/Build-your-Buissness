import { z } from "zod";

import { protokollLesen, type Protokoll } from "../protocol/v1.js";
import {
  mitNutzerTransaktion,
  type SqlVerbindung,
  type VerifizierteIdentitaet,
} from "./auth-kontext.js";

const LaufId = z.string().uuid();
const Beschreibung = z.string().trim().min(1).max(2000);

function idAus(ergebnis: { rows: Record<string, unknown>[] }, was: string): string {
  const id = ergebnis.rows[0]?.["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`${was} lieferte keine Kennung zurück.`);
  }
  return id;
}

function jsonbEinlesen(roh: unknown): unknown {
  if (typeof roh !== "string") return roh;
  return JSON.parse(roh) as unknown;
}

/**
 * Speichert das Protokoll und seine relationale Projektion atomar.
 *
 * Das JSON in `protokolle.inhalt` ist die kanonische Fassung. Läufe, Runden
 * und Befunde werden aus demselben validierten Objekt abgeleitet, damit Suche
 * und spätere Auswertungen keine zweite Eingabequelle bekommen.
 */
export async function protokollSpeichern(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  eingabe: Protokoll,
  beschreibung: string,
): Promise<Protokoll> {
  const protokoll = protokollLesen(eingabe);
  const laufId = LaufId.parse(protokoll.lauf_id);
  const text = Beschreibung.parse(beschreibung);

  await mitNutzerTransaktion(verbindung, identitaet, async (v) => {
    await v.query(
      `insert into laeufe
         (id, nutzer_id, beschreibung, zustand, begonnen, beendet)
       values ($1, $2, $3, 'fertig', to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))`,
      [laufId, identitaet.nutzerId, text, protokoll.begonnen, protokoll.beendet],
    );

    const gespeichert = await v.query(
      `insert into protokolle
         (lauf_id, nutzer_id, version, endzustand, abbruchgrund,
          gelaufene_klassen, tokens_ein, tokens_aus, laufzeit_ms, inhalt)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       returning id`,
      [
        laufId,
        identitaet.nutzerId,
        protokoll.version,
        protokoll.endzustand,
        protokoll.abbruchgrund,
        protokoll.gelaufene_klassen,
        protokoll.kosten_gesamt.tokens_ein,
        protokoll.kosten_gesamt.tokens_aus,
        protokoll.kosten_gesamt.laufzeit_ms,
        JSON.stringify(protokoll),
      ],
    );
    const protokollId = idAus(gespeichert, "Protokollspeicherung");

    for (const runde of protokoll.runden) {
      await v.query(
        `insert into runden
           (protokoll_id, nutzer_id, nummer, gelaufene_klassen,
            tokens_ein, tokens_aus, laufzeit_ms)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          protokollId,
          identitaet.nutzerId,
          runde.nummer,
          runde.gelaufene_klassen,
          runde.kosten.tokens_ein,
          runde.kosten.tokens_aus,
          runde.kosten.laufzeit_ms,
        ],
      );
    }

    for (const befund of protokoll.befunde) {
      await v.query(
        `insert into befunde
           (protokoll_id, nutzer_id, kategorie, angriffsklasse, schweregrad,
            klartext, nachweis, zustand, runde, erstellt)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))`,
        [
          protokollId,
          identitaet.nutzerId,
          befund.kategorie,
          befund.angriffsklasse,
          befund.schweregrad,
          befund.klartext,
          befund.nachweis,
          befund.zustand,
          befund.runde,
          befund.zeitstempel,
        ],
      );
    }
  });

  return protokoll;
}

/**
 * Liest nur die kanonische Fassung. RLS entscheidet, ob der Lauf für die
 * Identität sichtbar ist; ein fremder Lauf sieht deshalb genauso aus wie ein
 * nicht vorhandener Lauf.
 */
export async function protokollLaden(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  laufIdEingabe: string,
): Promise<Protokoll | undefined> {
  const laufId = LaufId.parse(laufIdEingabe);

  return mitNutzerTransaktion(verbindung, identitaet, async (v) => {
    const ergebnis = await v.query(
      "select inhalt from protokolle where lauf_id = $1",
      [laufId],
    );
    const roh = ergebnis.rows[0]?.["inhalt"];
    if (roh === undefined) return undefined;
    return protokollLesen(jsonbEinlesen(roh));
  });
}
