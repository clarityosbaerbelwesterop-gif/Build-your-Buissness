import { Client } from "pg";
import { z } from "zod";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { verbindungenLaden } from "../connector-hub/speicher.js";
import { auftraegeLaden } from "../control-plane/lesen.js";
import { auftragAusZielPlanen } from "../control-plane/planer.js";
import { auftragSpeichern } from "../control-plane/speicher.js";
import { zugang } from "../config/zugaenge.js";
import type { SqlVerbindung, VerifizierteIdentitaet } from "../db/auth-kontext.js";

const NeuerAuftrag = z
  .object({
    ziel: z.string().trim().min(10).max(4_000),
    creditDeckel: z.number().int().min(1).max(100_000).optional(),
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

export async function GET(request: Request): Promise<Response> {
  let identitaet: VerifizierteIdentitaet;
  try {
    identitaet = await identitaetAus(request);
  } catch {
    return json({ fehler: "NICHT_AUTORISIERT" }, 401);
  }

  try {
    const auftraege = await mitDatenbank((db) => auftraegeLaden(db, identitaet, 10));
    return json({ auftraege });
  } catch {
    return json({ fehler: "AUFTRAEGE_NICHT_VERFUEGBAR" }, 503);
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
    const eingabe = NeuerAuftrag.parse(JSON.parse(rohText) as unknown);
    const auftrag = await mitDatenbank(async (db) => {
      const verbindungen = await verbindungenLaden(db, identitaet);
      const geplant = await auftragAusZielPlanen(
        identitaet.nutzerId,
        eingabe.ziel,
        eingabe.creditDeckel ?? 500,
        verbindungen,
      );
      return auftragSpeichern(db, identitaet, geplant);
    });
    return json({ auftrag }, 201);
  } catch (fehler) {
    if (fehler instanceof z.ZodError || fehler instanceof SyntaxError) {
      return json({ fehler: "AUFTRAG_UNGUELTIG" }, 400);
    }
    return json({ fehler: "PLANUNG_NICHT_VERFUEGBAR" }, 503);
  }
}
