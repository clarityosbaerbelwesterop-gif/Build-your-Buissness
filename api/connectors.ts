import { Client } from "pg";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { zugang } from "../config/zugaenge.js";
import { verbindungenLaden } from "../connector-hub/speicher.js";
import type { ConnectorVerbindung } from "../connector-hub/v1.js";
import type { SqlVerbindung } from "../db/auth-kontext.js";

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
  try {
    const token = bearerTokenAus(request.headers.get("authorization") ?? undefined);
    const identitaet = await neonJwtPruefer(neonJwtKonfigurationAusUmgebung())(token);
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
      const daten = await verbindungenLaden(verbindung, identitaet);
      return json({ verbindungen: connectorUebersicht(daten) });
    } finally {
      await klient.end();
    }
  } catch {
    return json({ fehler: "NICHT_AUTORISIERT" }, 401);
  }
}
