import { describe, expect, it } from "vitest";

import { identitaetNachVerifikation, type SqlVerbindung } from "../db/auth-kontext.js";
import {
  projektWerkzeugeFuerWorkerLaden,
  projektWerkzeugeSpeichern,
  verbindungSpeichern,
} from "./speicher.js";
import {
  ConnectorVerbindung,
  UnternehmensWerkzeuge,
  type ConnectorVerbindung as ConnectorVerbindungTyp,
} from "./v1.js";

function github(): ConnectorVerbindungTyp {
  return ConnectorVerbindung.parse({
    version: 1,
    id: "github-1",
    anbieter: "github",
    modus: "oauth",
    konto_ref: "konto-github",
    status: "verbunden",
    scopes: ["contents:write"],
    ressourcen: [{ id: "firma/repo", art: "repo", name: "Firma Repo" }],
  });
}

function neon(): ConnectorVerbindungTyp {
  return ConnectorVerbindung.parse({
    version: 1,
    id: "neon-1",
    anbieter: "neon",
    modus: "oauth",
    konto_ref: "konto-neon",
    status: "verbunden",
    scopes: ["projects:read"],
    ressourcen: [{ id: "neon-projekt", art: "datenbank_projekt", name: "Neon Projekt" }],
  });
}

function vercel(): ConnectorVerbindungTyp {
  return ConnectorVerbindung.parse({
    version: 1,
    id: "vercel-1",
    anbieter: "vercel",
    modus: "oauth",
    konto_ref: "konto-vercel",
    status: "verbunden",
    scopes: ["project:read"],
    ressourcen: [{ id: "vercel-projekt", art: "vercel_projekt", name: "Vercel Projekt" }],
  });
}

function auswahl() {
  return UnternehmensWerkzeuge.parse({
    github_repo: { verbindung_id: "github-1", ressourcen_id: "firma/repo" },
    backend: { anbieter: "neon", verbindung_id: "neon-1", ressourcen_id: "neon-projekt" },
    vercel_projekt: { verbindung_id: "vercel-1", ressourcen_id: "vercel-projekt" },
  });
}

function verbindungMitAntworten(
  antwort: (sql: string) => Record<string, unknown>[],
): { readonly db: SqlVerbindung; readonly sql: string[] } {
  const sql: string[] = [];
  return {
    sql,
    db: {
      query(abfrage: string) {
        sql.push(abfrage);
        return Promise.resolve({ rows: antwort(abfrage) });
      },
    },
  };
}

describe("Connector-Hub-Speicher", () => {
  it("weist Secret-Felder vor jedem Datenbankzugriff zurück", async () => {
    const { db, sql } = verbindungMitAntworten(() => []);
    const identitaet = identitaetNachVerifikation("nutzer-1");
    const mitSecret = { ...github(), access_token: "darf-nicht-gespeichert-werden" } as unknown as ConnectorVerbindungTyp;

    await expect(verbindungSpeichern(db, identitaet, mitSecret)).rejects.toThrow();
    expect(sql).toEqual([]);
  });

  it("speichert eine Verbindung ausschließlich im Nutzer-RLS-Kontext", async () => {
    const { db, sql } = verbindungMitAntworten(() => []);
    const identitaet = identitaetNachVerifikation("nutzer-1");

    await expect(verbindungSpeichern(db, identitaet, github())).resolves.toMatchObject({ id: "github-1" });
    expect(sql[0]).toBe("begin");
    expect(sql[1]).toBe("set local role byb_app");
    expect(sql[2]).toContain("request.jwt.claims");
    expect(sql[3]).toContain("insert into connector_verbindungen");
    expect(sql[4]).toBe("commit");
  });

  it("persistiert Resource Picks erst nach Auflösung gegen eigene Verbindungen", async () => {
    const verbindungen = [github(), neon(), vercel()];
    const { db, sql } = verbindungMitAntworten((abfrage) =>
      abfrage.includes("from connector_verbindungen")
        ? verbindungen.map((inhalt) => ({ inhalt }))
        : [],
    );
    const identitaet = identitaetNachVerifikation("nutzer-1");

    const stand = await projektWerkzeugeSpeichern(db, identitaet, "projekt-1", auswahl());
    expect(stand.aufgeloest.githubRepo.id).toBe("firma/repo");
    expect(stand.aufgeloest.backend.id).toBe("neon-projekt");
    expect(sql.some((abfrage) => abfrage.includes("insert into connector_projekt_werkzeuge"))).toBe(true);
  });

  it("lädt Resource Picks für den Worker nur über dessen begrenzten Lese-Kontext", async () => {
    const verbindungen = [github(), neon(), vercel()];
    const { db, sql } = verbindungMitAntworten((abfrage) => {
      if (abfrage.includes("from connector_projekt_werkzeuge")) return [{ inhalt: auswahl() }];
      if (abfrage.includes("from connector_verbindungen")) {
        return verbindungen.map((inhalt) => ({ inhalt }));
      }
      return [];
    });

    const stand = await projektWerkzeugeFuerWorkerLaden(db, "nutzer-1", "projekt-1");
    expect(stand?.aufgeloest.vercelProjekt.id).toBe("vercel-projekt");
    expect(sql[0]).toBe("begin");
    expect(sql[1]).toBe("set local role byb_worker");
    expect(sql.some((abfrage) => abfrage.includes("request.jwt.claims"))).toBe(false);
    expect(sql.at(-1)).toBe("commit");
  });
});
