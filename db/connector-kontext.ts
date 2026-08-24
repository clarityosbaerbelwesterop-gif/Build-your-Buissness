import type { SqlVerbindung, VerifizierteIdentitaet } from "./auth-kontext.js";

/**
 * Kurzlebiger Connector-Kontext für OAuth-/Installationshandshakes.
 *
 * Die Rolle besitzt weder Anwendungs- noch Worker-Rechte. Sie darf nur auf
 * explizit für den Connector Layer freigegebene Tabellen zugreifen. Claims
 * gelten nur innerhalb dieser Transaktion.
 */
export async function mitConnectorTransaktion<T>(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  arbeit: (verbindung: SqlVerbindung) => Promise<T>,
): Promise<T> {
  await verbindung.query("begin");
  try {
    await verbindung.query("set local role byb_connector");
    await verbindung.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: identitaet.nutzerId })],
    );
    const ergebnis = await arbeit(verbindung);
    await verbindung.query("commit");
    return ergebnis;
  } catch (fehler) {
    await verbindung.query("rollback").catch(() => undefined);
    throw fehler;
  }
}
