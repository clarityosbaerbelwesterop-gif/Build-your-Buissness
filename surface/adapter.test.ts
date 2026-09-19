import { describe, expect, it, vi } from "vitest";

import { agentStarten, studioKnotenAufrufen, verbrauchMelden } from "./adapter.js";

const HTTPS = "https://example.invalid";

describe("Surface-Adapter", () => {
  it("bleibt ehrlich leer, wenn keine Laufzeit verbunden ist", async () => {
    const umgebung = {};
    const studio = await studioKnotenAufrufen({
      idee: "Ein Angebot für Klartext-Coaching.",
      auftragId: "a1",
      aktionId: "surface-landing",
      umgebung,
    });
    const agent = await agentStarten({
      idee: "Ein Angebot für Klartext-Coaching.",
      auftragId: "a1",
      aktionId: "surface-agent",
      umgebung,
    });
    const meter = await verbrauchMelden({
      idee: "Ein Angebot für Klartext-Coaching.",
      auftragId: "a1",
      aktionId: "surface-landing",
      credits: 40,
      umgebung,
    });

    expect(studio.status).toBe("nicht_verbunden");
    expect(agent.status).toBe("nicht_verbunden");
    expect(meter.status).toBe("nicht_verbunden");
    expect(studio.hinweis).not.toMatch(/Zeus|Studio|SCP|Neon|Vercel/i);
    expect(agent.hinweis).not.toMatch(/Zeus|Studio|SCP/i);
  });

  it("ruft vorhandene Endpunkte auf und erfindet keinen lokalen Prüfer", async () => {
    const hole = vi.fn((url: string): Promise<Response> => {
      if (url.endsWith("/api/studio/runs")) {
        return Promise.resolve(new Response(JSON.stringify({ runId: "studio-1" }), { status: 200 }));
      }
      if (url.endsWith("/api/runs")) {
        return Promise.resolve(new Response(JSON.stringify({ id: "run-9" }), { status: 200 }));
      }
      if (url.endsWith("/hooks/meter")) {
        return Promise.resolve(new Response("{}", { status: 202 }));
      }
      return Promise.resolve(new Response("missing", { status: 404 }));
    });

    const umgebung = {
      STUDIO_BASE_URL: HTTPS,
      ZEUS_BASE_URL: HTTPS,
      SCP_BASE_URL: HTTPS,
    };

    const studio = await studioKnotenAufrufen({
      idee: "Angebot für ruhige Angebotsseiten.",
      auftragId: "a1",
      aktionId: "surface-landing",
      umgebung,
      fetchImpl: hole,
    });
    const agent = await agentStarten({
      idee: "Angebot für ruhige Angebotsseiten.",
      auftragId: "a1",
      aktionId: "surface-agent",
      umgebung,
      fetchImpl: hole,
    });
    const meter = await verbrauchMelden({
      idee: "Angebot für ruhige Angebotsseiten.",
      auftragId: "a1",
      aktionId: "surface-landing",
      credits: 40,
      umgebung,
      fetchImpl: hole,
    });

    expect(studio.status).toBe("verbunden");
    expect(agent.status).toBe("verbunden");
    expect(agent.referenz).toBe("run-9");
    expect(meter.status).toBe("verbunden");
    expect(hole).toHaveBeenCalledTimes(3);
  });

  it("lehnt unsichere Adapter-URLs ab", async () => {
    const antwort = await agentStarten({
      idee: "Angebot für ruhige Angebotsseiten.",
      auftragId: "a1",
      aktionId: "surface-agent",
      umgebung: { ZEUS_BASE_URL: "http://127.0.0.1:9" },
    });
    expect(antwort.status).toBe("nicht_verbunden");
  });
});
