import { Client } from "pg";
import { z } from "zod";

import { zugang } from "../config/zugaenge.js";
import { verbindungenLaden } from "../connector-hub/speicher.js";
import { auftragSpeichern } from "../control-plane/speicher.js";
import type { SqlVerbindung, VerifizierteIdentitaet } from "../db/auth-kontext.js";
import { surfaceIdentitaetAus } from "../surface/identitaet.js";
import { surfaceLaufAusAuftrag, surfaceLaufErzeugen } from "../surface/lauf.js";
import { surfaceAuftragLaden, surfaceLeadsZaehlen } from "../surface/speicher.js";
import { SurfaceIdee } from "../surface/plan.js";

const NeueIdee = z
  .object({
    idee: SurfaceIdee,
  })
  .strict();

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

async function identitaetAus(request: Request): Promise<VerifizierteIdentitaet> {
  return surfaceIdentitaetAus(request);
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
    const lauf = await mitDatenbank(async (db) => {
      const auftrag = await surfaceAuftragLaden(db, identitaet);
      if (auftrag === undefined) return null;
      const anzahl = await surfaceLeadsZaehlen(db, identitaet, auftrag.id);
      return surfaceLaufAusAuftrag(auftrag, anzahl ?? 0);
    });
    return json({ lauf });
  } catch {
    return json({ fehler: "LAUF_NICHT_VERFUEGBAR" }, 503);
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
    const eingabe = NeueIdee.parse(JSON.parse(rohText) as unknown);
    const lauf = await mitDatenbank(async (db) => {
      const verbindungen = await verbindungenLaden(db, identitaet);
      const erzeugt = await surfaceLaufErzeugen(
        identitaet.nutzerId,
        eingabe.idee,
        verbindungen,
      );
      await auftragSpeichern(db, identitaet, erzeugt.auftrag);
      return erzeugt.lauf;
    });
    return json({ lauf }, 201);
  } catch (fehler) {
    if (fehler instanceof z.ZodError || fehler instanceof SyntaxError) {
      return json({ fehler: "IDEE_UNGUELTIG" }, 400);
    }
    return json({ fehler: "LAUF_NICHT_VERFUEGBAR" }, 503);
  }
}
