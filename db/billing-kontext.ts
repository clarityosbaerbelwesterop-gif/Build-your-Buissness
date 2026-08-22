import type { SqlVerbindung } from "./auth-kontext.js";

/**
 * Führt Stripe-/Credit-Schreibzugriffe ausschließlich unter `byb_billing` aus.
 * Die Rolle ist NOLOGIN/NOBYPASSRLS und besitzt keine Rechte auf Auth-,
 * Protokoll-, Connector- oder allgemeine Nutzerdaten.
 */
export async function mitBillingTransaktion<T>(
  verbindung: SqlVerbindung,
  arbeit: (verbindung: SqlVerbindung) => Promise<T>,
): Promise<T> {
  await verbindung.query("begin");
  try {
    await verbindung.query("set local role byb_billing");
    const ergebnis = await arbeit(verbindung);
    await verbindung.query("commit");
    return ergebnis;
  } catch (fehler) {
    await verbindung.query("rollback").catch(() => undefined);
    throw fehler;
  }
}
