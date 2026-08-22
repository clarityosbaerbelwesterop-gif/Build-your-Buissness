import type { SqlVerbindung } from "./auth-kontext.js";

/**
 * Führt eine interne Hintergrundarbeit mit der eng begrenzten Rolle
 * `byb_worker` aus.
 *
 * Die Rolle ist NOLOGIN/NOBYPASSRLS und bekommt in Migration 003 ausschließlich
 * auf den Control-Plane-Tabellen eine explizite RLS-Policy. Sie ist deshalb
 * kein allgemeiner Service-Role-Ersatz und darf nicht für Nutzerdatenzugriffe
 * oder Connector-Secrets verwendet werden.
 */
export async function mitWorkerTransaktion<T>(
  verbindung: SqlVerbindung,
  arbeit: (verbindung: SqlVerbindung) => Promise<T>,
): Promise<T> {
  await verbindung.query("begin");
  try {
    await verbindung.query("set local role byb_worker");
    const ergebnis = await arbeit(verbindung);
    await verbindung.query("commit");
    return ergebnis;
  } catch (fehler) {
    await verbindung.query("rollback").catch(() => undefined);
    throw fehler;
  }
}
