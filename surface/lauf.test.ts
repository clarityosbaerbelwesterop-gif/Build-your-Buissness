import { describe, expect, it } from "vitest";

import { SURFACE_AKTION } from "./v1.js";
import { surfaceLaufAusAuftrag, surfaceLaufErzeugen } from "./lauf.js";

describe("Surface-Lauf", () => {
  it("erzeugt Landing, Anfragen und Agent über die Control Plane", async () => {
    const { auftrag, lauf } = await surfaceLaufErzeugen(
      "nutzer-1",
      "Coaching für Gründerinnen mit einer klaren Erstberatung auf einer Seite.",
      [],
      {
        idErzeugen: () => "fest",
        jetzt: () => 1_000,
        umgebung: {},
      },
    );

    expect(auftrag.id).toBe("auftrag-fest");
    expect(auftrag.aktionen.map((aktion) => aktion.zustand)).toEqual([
      "erfolgreich",
      "erfolgreich",
      "erfolgreich",
    ]);
    expect(auftrag.credits_verbraucht).toBe(0);
    expect(lauf.landing.kopie?.titel.length).toBeGreaterThan(3);
    expect(lauf.landing.html).toContain("<h1>");
    expect(lauf.lead.aktiv).toBe(true);
    expect(lauf.agent.zustand).toBe("nicht_verbunden");
    expect(lauf.zustand).toBe("teilweise");
    expect(JSON.stringify(lauf)).not.toMatch(/Zeus|Studio|SCP|Neon|NVIDIA|Vercel|Stripe/i);
  });

  it("zeigt einen verbundenen Agenten, ohne Verbrauch zu erfinden", async () => {
    const { lauf } = await surfaceLaufErzeugen(
      "nutzer-1",
      "Angebot für Werkstätten, die Termin-Anfragen sammeln wollen.",
      [],
      {
        umgebung: { ZEUS_BASE_URL: "https://agents.example.invalid" },
        fetchImpl: (url: string) => {
          if (url.endsWith("/api/runs")) {
            return Promise.resolve(new Response(JSON.stringify({ id: "agent-1" }), { status: 200 }));
          }
          return Promise.resolve(new Response("{}", { status: 404 }));
        },
      },
    );

    expect(lauf.agent.zustand).toBe("laeuft");
    expect(lauf.agent.referenz).toBe("agent-1");
    expect(lauf.credits_verbraucht).toBe(0);
    expect(lauf.zustand).toBe("bereit");
  });

  it("liest einen gespeicherten Auftrag zurück in die Oberfläche", async () => {
    const { auftrag } = await surfaceLaufErzeugen(
      "nutzer-1",
      "Schreibcoaching für Solo-Gründer mit einer festen Erstseite.",
      [],
      { umgebung: {} },
    );
    const lauf = surfaceLaufAusAuftrag(auftrag, 2);
    expect(lauf.lead.anzahl).toBe(2);
    expect(lauf.schritte.map((schritt) => schritt.art)).toEqual(["landing", "lead", "agent"]);
    expect(auftrag.aktionen.find((aktion) => aktion.id === SURFACE_AKTION.landing)?.ergebnis)
      .toContain("\"art\":\"landing\"");
  });
});
