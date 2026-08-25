import { Client } from "pg";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { zugang } from "../config/zugaenge.js";
import { mitNutzerTransaktion, type SqlVerbindung, type VerifizierteIdentitaet } from "../db/auth-kontext.js";

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

async function identitaetAus(request: Request): Promise<VerifizierteIdentitaet> {
  const token = bearerTokenAus(request.headers.get("authorization") ?? undefined);
  return neonJwtPruefer(neonJwtKonfigurationAusUmgebung())(token);
}

export async function GET(request: Request): Promise<Response> {
  let identitaet: VerifizierteIdentitaet;
  try {
    identitaet = await identitaetAus(request);
  } catch {
    return json({ fehler: "NICHT_AUTORISIERT" }, 401);
  }

  const klient = new Client({
    connectionString: zugang("datenbankUrl"),
    ssl: { rejectUnauthorized: true },
  });
  try {
    await klient.connect();
    const verbindung: SqlVerbindung = {
      query: async (sql, werte) => {
        const ergebnis = await klient.query<Record<string, unknown>>(sql, werte);
        return { rows: ergebnis.rows };
      },
    };
    const daten = await mitNutzerTransaktion(verbindung, identitaet, async (tx) => {
      const ergebnis = await tx.query(
        `select a.plan_key, a.status, a.monatliche_credits,
                c.saldo, c.reserviert, c.revision
           from credit_konten c
           left join billing_abos a on a.nutzer_id = c.nutzer_id
          where c.nutzer_id = $1`,
        [identitaet.nutzerId],
      );
      return ergebnis.rows[0] ?? null;
    });
    return json({ billing: daten });
  } catch {
    return json({ fehler: "BILLING_NICHT_VERFUEGBAR" }, 503);
  } finally {
    await klient.end().catch(() => undefined);
  }
}
