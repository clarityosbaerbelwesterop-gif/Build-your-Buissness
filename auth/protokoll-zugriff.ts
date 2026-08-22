import type { Protokoll } from "../protocol/v1.js";
import type { SqlVerbindung } from "../db/auth-kontext.js";
import { protokollLaden, protokollSpeichern } from "../db/protokoll-speicher.js";
import { bearerTokenAus, type TokenPruefer } from "./neon-jwt.js";

/**
 * Dünne Auth-Grenze vor dem bereits nachgewiesenen M0.6-Speicherpfad.
 *
 * Das rohe Token wird ausschließlich an den kryptografischen Prüfer gegeben.
 * In die Datenbankschicht gelangt danach nur die verifizierte Nutzerkennung.
 */
export async function protokollSpeichernMitBearer(
  verbindung: SqlVerbindung,
  authorization: string | undefined,
  pruefer: TokenPruefer,
  protokoll: Protokoll,
  beschreibung: string,
): Promise<Protokoll> {
  const identitaet = await pruefer(bearerTokenAus(authorization));
  return protokollSpeichern(verbindung, identitaet, protokoll, beschreibung);
}

export async function protokollLadenMitBearer(
  verbindung: SqlVerbindung,
  authorization: string | undefined,
  pruefer: TokenPruefer,
  laufId: string,
): Promise<Protokoll | undefined> {
  const identitaet = await pruefer(bearerTokenAus(authorization));
  return protokollLaden(verbindung, identitaet, laufId);
}
