import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as auftraegeGET } from "./auftraege.js";
import { GET as surfaceGET, POST as surfacePOST } from "./surface.js";
import { POST as surfaceLeadsPOST } from "./surface-leads.js";
import { UNPAID_SURFACE_FLAG, UNPAID_SURFACE_NUTZER_ID } from "../surface/identitaet.js";

const ORIGIN = "https://build-your-buissness.vercel.app";
const IDEE = "Coaching für Gründerinnen, die ihre erste Angebotsseite live bringen wollen.";
const MODELL_KEYS = [
  "NV_API_KEY_1",
  "NV_API_KEY_2",
  "NV_API_KEY_3",
  "STUDIO_BASE_URL",
  "ZEUS_BASE_URL",
  "AGENT_BASE_URL",
  "SCP_BASE_URL",
  "ODIN_SCP_URL",
] as const;

const { speicher } = vi.hoisted(() => ({
  speicher: {
    auftraege: [] as {
      readonly id: string;
      readonly nutzerId: string;
      readonly projektId: string;
      readonly inhalt: unknown;
    }[],
    leads: [] as { readonly auftragId: string; readonly nutzerId: string }[],
    claims: "",
    sql: [] as string[],
  },
}));

vi.mock("pg", () => {
  class Client {
    connect(): Promise<void> {
      return Promise.resolve();
    }

    end(): Promise<void> {
      return Promise.resolve();
    }

    query(sql: string, werte: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
      const s = sql.replace(/\s+/g, " ").trim().toLowerCase();
      speicher.sql.push(s);

      if (s.includes("set_config") && s.includes("request.jwt.claims")) {
        const roh = JSON.parse(String(werte[0])) as { sub?: unknown };
        speicher.claims = typeof roh.sub === "string" ? roh.sub : "";
        return Promise.resolve({ rows: [] });
      }

      if (s.includes("insert into steuer_auftraege")) {
        speicher.auftraege.unshift({
          id: String(werte[0]),
          nutzerId: String(werte[1]),
          projektId: String(werte[2]),
          inhalt: JSON.parse(String(werte[7])) as unknown,
        });
        return Promise.resolve({ rows: [] });
      }

      if (s.includes("insert into surface_leads")) {
        speicher.leads.push({
          auftragId: String(werte[2]),
          nutzerId: String(werte[1]),
        });
        return Promise.resolve({ rows: [] });
      }

      if (s.includes("from surface_leads") && s.includes("count")) {
        const auftragId = String(werte[0]);
        const anzahl = speicher.leads.filter((lead) => lead.auftragId === auftragId).length;
        return Promise.resolve({ rows: [{ anzahl }] });
      }

      if (s.includes("select id from steuer_auftraege")) {
        const id = String(werte[0]);
        const projektId = String(werte[1]);
        const gefunden = speicher.auftraege.find(
          (auftrag) => auftrag.id === id && auftrag.projektId === projektId,
        );
        return Promise.resolve({ rows: gefunden === undefined ? [] : [{ id: gefunden.id }] });
      }

      if (s.includes("from steuer_auftraege") && s.includes("select inhalt")) {
        const projektId = String(werte[0]);
        const gefunden = speicher.auftraege.find((auftrag) => auftrag.projektId === projektId);
        return Promise.resolve({
          rows: gefunden === undefined ? [] : [{ inhalt: gefunden.inhalt }],
        });
      }

      return Promise.resolve({ rows: [] });
    }
  }

  return { Client };
});

function leer(pfad: string, init?: RequestInit): Request {
  return new Request(`${ORIGIN}${pfad}`, init);
}

describe("Surface-API", () => {
  const ursprung: Record<string, string | undefined> = {};

  beforeEach(() => {
    ursprung[UNPAID_SURFACE_FLAG] = process.env[UNPAID_SURFACE_FLAG];
    ursprung["DATABASE_URL"] = process.env["DATABASE_URL"];
    for (const name of MODELL_KEYS) ursprung[name] = process.env[name];

    delete process.env[UNPAID_SURFACE_FLAG];
    process.env["DATABASE_URL"] = "postgres://byb:byb@127.0.0.1:5432/byb";
    for (const name of MODELL_KEYS) delete process.env[name];

    speicher.auftraege = [];
    speicher.leads = [];
    speicher.claims = "";
    speicher.sql = [];
  });

  afterEach(() => {
    for (const [name, wert] of Object.entries(ursprung)) {
      if (wert === undefined) delete process.env[name];
      else process.env[name] = wert;
    }
  });

  it("lehnt unautorisierte Lese- und Schreibzugriffe ab", async () => {
    const get = await surfaceGET(leer("/api/surface"));
    const post = await surfacePOST(leer("/api/surface", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idee: "Ein Angebot für ruhige Erstseiten." }),
    }));
    const lead = await surfaceLeadsPOST(leer("/api/surface-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auftragId: "auftrag-1",
        name: "Anna",
        email: "anna@example.com",
        nachricht: "Bitte um ein Gespräch.",
      }),
    }));

    expect(get.status).toBe(401);
    expect(post.status).toBe(401);
    expect(lead.status).toBe(401);
  });

  it("lässt Surface und Leads ohne Token zu, wenn das Flag gesetzt ist", async () => {
    process.env[UNPAID_SURFACE_FLAG] = "1";

    const leerGet = await surfaceGET(leer("/api/surface"));
    expect(leerGet.status).toBe(200);
    await expect(leerGet.json()).resolves.toEqual({ lauf: null });
    expect(speicher.claims).toBe(UNPAID_SURFACE_NUTZER_ID);
    expect(speicher.sql.some((sql) => sql.includes("set local role byb_app"))).toBe(true);

    const post = await surfacePOST(leer("/api/surface", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idee: IDEE }),
    }));
    expect(post.status).toBe(201);
    const erzeugt = await post.json() as {
      lauf?: { auftrag_id?: string; landing?: { html?: string }; lead?: { aktiv?: boolean } };
    };
    expect(erzeugt.lauf?.auftrag_id).toMatch(/^auftrag-/);
    expect(erzeugt.lauf?.landing?.html).toContain("<h1>");
    expect(erzeugt.lauf?.lead?.aktiv).toBe(true);
    expect(speicher.auftraege[0]?.nutzerId).toBe(UNPAID_SURFACE_NUTZER_ID);

    const lead = await surfaceLeadsPOST(leer("/api/surface-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auftragId: erzeugt.lauf?.auftrag_id,
        name: "Anna",
        email: "anna@example.com",
        nachricht: "Bitte um ein Gespräch zur Idee.",
      }),
    }));
    expect(lead.status).toBe(201);
    await expect(lead.json()).resolves.toEqual({ angenommen: true });
    expect(speicher.leads).toEqual([
      { auftragId: erzeugt.lauf?.auftrag_id, nutzerId: UNPAID_SURFACE_NUTZER_ID },
    ]);
  });

  it("öffnet den Leitstand nicht mit dem Surface-Flag", async () => {
    process.env[UNPAID_SURFACE_FLAG] = "1";
    const antwort = await auftraegeGET(leer("/api/auftraege"));
    expect(antwort.status).toBe(401);
  });
});
