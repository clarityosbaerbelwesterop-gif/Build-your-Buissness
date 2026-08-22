import { z } from "zod";

const Nutzerkennung = z.string().trim().min(1).max(200);

/**
 * Identität, deren Tokenprüfung bereits an der Auth-Grenze stattgefunden hat.
 *
 * Diese Datei prüft bewusst keine JWT-Signaturen. Der spätere Auth-Adapter ist
 * dafür zuständig. Hier wird nur die daraus stammende `sub`-Kennung in den
 * Datenbankkontext übernommen.
 */
export interface VerifizierteIdentitaet {
  readonly nutzerId: string;
}

export function identitaetNachVerifikation(sub: string): VerifizierteIdentitaet {
  return { nutzerId: Nutzerkennung.parse(sub) };
}

export interface SqlErgebnis {
  readonly rows: Record<string, unknown>[];
}

export interface SqlVerbindung {
  query(sql: string, werte?: unknown[]): Promise<SqlErgebnis>;
}

/**
 * Führt genau eine Arbeit im Mandantenkontext aus.
 *
 * `byb_app` ist NOLOGIN/NOBYPASSRLS. Die eigentliche Verbindung darf deshalb
 * eine Verwaltungsrolle sein; innerhalb der Transaktion werden die
 * Anwendungsschritte auf die engere Rolle reduziert. `SET LOCAL` und die JWT-
 * Claims verschwinden automatisch mit COMMIT/ROLLBACK.
 */
export async function mitNutzerTransaktion<T>(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  arbeit: (verbindung: SqlVerbindung) => Promise<T>,
): Promise<T> {
  await verbindung.query("begin");
  try {
    await verbindung.query("set local role byb_app");
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
