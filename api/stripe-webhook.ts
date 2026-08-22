import { Client } from "pg";

import { billingBefehlSpeichern } from "../billing/speicher.js";
import { stripeEventNormalisieren } from "../billing/stripe-event.js";
import { stripeWebhookSignaturPruefen } from "../billing/stripe-signatur.js";
import { zugang } from "../config/zugaenge.js";
import type { SqlVerbindung } from "../db/auth-kontext.js";

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ fehler: "METHOD_NOT_ALLOWED" }, 405);

  const payload = await request.text();
  const signatur = request.headers.get("stripe-signature");
  if (signatur === null) return json({ fehler: "SIGNATUR_FEHLT" }, 400);

  try {
    stripeWebhookSignaturPruefen(payload, signatur, zugang("stripeWebhookSecret"));
    const befehl = stripeEventNormalisieren(JSON.parse(payload) as unknown);
    const klient = new Client({
      connectionString: zugang("datenbankUrl"),
      ssl: { rejectUnauthorized: true },
    });
    await klient.connect();
    try {
      const verbindung: SqlVerbindung = {
        query: async (sql, werte) => {
          const ergebnis = await klient.query<Record<string, unknown>>(sql, werte);
          return { rows: ergebnis.rows };
        },
      };
      const ergebnis = await billingBefehlSpeichern(verbindung, befehl);
      return json({ empfangen: true, ...ergebnis });
    } finally {
      await klient.end();
    }
  } catch {
    return json({ fehler: "WEBHOOK_NICHT_VERARBEITET" }, 400);
  }
}
