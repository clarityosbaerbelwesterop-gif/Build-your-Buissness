import { AuthTokenFehler, bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { gesetzt } from "../config/umgebung.js";
import { identitaetNachVerifikation, type VerifizierteIdentitaet } from "../db/auth-kontext.js";

/**
 * Synthetische Surface-Gastkennung, wenn unbezahlter Produktcheck aktiv ist.
 *
 * Die Kennung läuft weiter durch `mitNutzerTransaktion` und `auth.nutzer_kennung()`.
 * RLS bleibt erzwungen; es gibt keinen Owner-Bypass. Alle unbezahlten Surface-
 * Besucher teilen diesen einen Mandanten — das Flag ist nur für den Produktcheck.
 */
export const UNPAID_SURFACE_NUTZER_ID = "byb-unpaid-surface";

export const UNPAID_SURFACE_FLAG = "BYB_ALLOW_UNPAID_SURFACE";

export function unpaidSurfaceErlaubt(
  umgebung: Record<string, string | undefined> = process.env,
): boolean {
  return gesetzt(UNPAID_SURFACE_FLAG, umgebung) === "1";
}

/**
 * Surface-Identität: gültiges Neon-JWT gewinnt immer.
 * Ohne Authorization und mit Flag `1` wird die Gastkennung verwendet.
 * Ein vorhandener, aber ungültiger Bearer wird nicht zum Gast umgedeutet.
 */
export async function surfaceIdentitaetAus(
  request: Request,
  umgebung: Record<string, string | undefined> = process.env,
): Promise<VerifizierteIdentitaet> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    try {
      const token = bearerTokenAus(authorization);
      return await neonJwtPruefer(neonJwtKonfigurationAusUmgebung(umgebung))(token);
    } catch (fehler) {
      if (fehler instanceof AuthTokenFehler) throw fehler;
      throw new AuthTokenFehler();
    }
  }
  if (unpaidSurfaceErlaubt(umgebung)) {
    return identitaetNachVerifikation(UNPAID_SURFACE_NUTZER_ID);
  }
  throw new AuthTokenFehler();
}
