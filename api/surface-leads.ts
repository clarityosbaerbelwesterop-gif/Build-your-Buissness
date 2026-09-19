import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { z } from "zod";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { zugang } from "../config/zugaenge.js";
import type { SqlVerbindung, VerifizierteIdentitaet } from "../db/auth-kontext.js";
import { surfaceLeadSpeichern } from "../surface/speicher.js";

const NeueAnfrage = z
  .object({
    auftragId: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    nachricht: z.string().trim().min(1).max(2_000),
  })
  .strict();

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

async function identitaetAus(request: Request): Promise<VerifizierteIdentitaet> {
  const token = bearerTokenAus(request.headers.get("authorization") ?? undefined);
  return neonJwtPruefer(neonJwtKonfigurationAusUmgebung())(token);
}

async function mitDatenbank<T>(arbeit: (db: SqlVerbindung) => Promise<T>): Promise<T> {
  const klient = new Client({
    connectionString: zugang("datenbankUrl"),
    ssl: { rejectUnauthorized: true },
  });
  await klient.connect();
  try {
    const db: SqlVerbindung = {
      query: async (sql, werte) => {
        const ergebnis = await klient.query<Record<string, unknown>>(sql, werte);
        return { rows: ergebnis.rows };
      },
    };
    return await arbeit(db);
  } finally {
    await klient.end();
  }
}

export async function POST(request: Request): Promise<Response> {
  let identitaet: VerifizierteIdentitaet;
  try {
    identitaet = await identitaetAus(request);
  } catch {
    return json({ fehler: "NICHT_AUTORISIERT" }, 401);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ fehler: "JSON_ERWARTET" }, 415);
  }

  try {
    const rohText = await request.text();
    if (rohText.length > 8_192) return json({ fehler: "ANFRAGE_ZU_GROSS" }, 413);
    const eingabe = NeueAnfrage.parse(JSON.parse(rohText) as unknown);
    await mitDatenbank((db) =>
      surfaceLeadSpeichern(db, identitaet, {
        id: `lead-${randomUUID()}`,
        auftragId: eingabe.auftragId,
        name: eingabe.name,
        email: eingabe.email,
        nachricht: eingabe.nachricht,
      }),
    );
    return json({ angenommen: true }, 201);
  } catch (fehler) {
    if (fehler instanceof z.ZodError || fehler instanceof SyntaxError) {
      return json({ fehler: "ANFRAGE_UNGUELTIG" }, 400);
    }
    if (fehler instanceof Error && fehler.message === "SURFACE_AUFTRAG_FEHLT") {
      return json({ fehler: "LAUF_NICHT_GEFUNDEN" }, 404);
    }
    return json({ fehler: "ANFRAGE_NICHT_VERFUEGBAR" }, 503);
  }
}
