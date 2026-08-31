import { Client } from "pg";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { zugang } from "../config/zugaenge.js";
import { verbindungenLaden } from "../connector-hub/speicher.js";
import type { ConnectorVerbindung } from "../connector-hub/v1.js";
import type { SqlVerbindung, VerifizierteIdentitaet } from "../db/auth-kontext.js";

export interface ConnectorUebersicht {
  readonly id: string;
  readonly anbieter: ConnectorVerbindung["anbieter"];
  readonly status: ConnectorVerbindung["status"];
  readonly konto_ref: string;
  readonly ressourcen: readonly {
    readonly id: string;
    readonly art: ConnectorVerbindung["ressourcen"][number]["art"];
    readonly name: string;
  }[];
}

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

async function identitaetAus(request: Request): Promise<VerifizierteIdentitaet> {
  const token = bearerTokenAus(request.headers.get("authorization") ?? undefined);
  return neonJwtPruefer(neonJwtKonfigurationAusUmgebung())(token);
}

export function connectorUebersicht(
  verbindungen: readonly ConnectorVerbindung[],
): readonly ConnectorUebersicht[] {
  return verbindungen.map((verbindung) => ({
    id: verbindung.id,
    anbieter: verbindung.anbieter,
    status: verbindung.status,
    konto_ref: verbindung.konto_ref,
    ressourcen: verbindung.ressourcen.map((ressource) => ({
      id: ressource.id,
      art: ressource.art,
      name: ressource.name,
    })),
  }));
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
    const daten = await verbindungenLaden(verbindung, identitaet);
    return json({ verbindungen: connectorUebersicht(daten) });
  } catch {
    return json({ fehler: "CONNECTOREN_NICHT_VERFUEGBAR" }, 503);
  } finally {
    await klient.end().catch(() => undefined);
  }
}
