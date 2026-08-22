import { Client } from "pg";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { zugang } from "../config/zugaenge.js";
import { mitNutzerTransaktion, type SqlVerbindung } from "../db/auth-kontext.js";

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") return json({ fehler: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const token = bearerTokenAus(request.headers.get("authorization") ?? undefined);
    const identitaet = await neonJwtPruefer(neonJwtKonfigurationAusUmgebung())(token);
    const klient = new Client({ connectionString: zugang("datenbankUrl"), ssl: { rejectUnauthorized: true } });
    await klient.connect();
    try {
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
    } finally {
      await klient.end();
    }
  } catch {
    return json({ fehler: "NICHT_AUTORISIERT" }, 401);
  }
}
