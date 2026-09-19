import { describe, expect, it } from "vitest";

import { SURFACE_AKTION, SURFACE_PROJEKT_ID } from "./v1.js";
import { istSurfaceAuftrag, surfaceAuftragPlanen } from "./plan.js";

describe("Surface-Plan", () => {
  it("legt einen festen BYB-Auftrag ohne Zahlungen und ohne CRM an", () => {
    const auftrag = surfaceAuftragPlanen(
      "nutzer-1",
      "Coaching für Gründerinnen mit einer klaren Erstberatung.",
      [],
      { idErzeugen: () => "fest", jetzt: () => 1_000 },
    );

    expect(auftrag.projekt_id).toBe(SURFACE_PROJEKT_ID);
    expect(istSurfaceAuftrag(auftrag)).toBe(true);
    expect(auftrag.aktionen.map((aktion) => aktion.id)).toEqual([
      SURFACE_AKTION.landing,
      SURFACE_AKTION.lead,
      SURFACE_AKTION.agent,
    ]);
    expect(auftrag.aktionen.map((aktion) => aktion.typ)).toEqual(["code", "backend", "planen"]);
    expect(auftrag.aktionen.some((aktion) => aktion.typ === "payments")).toBe(false);
    expect(auftrag.aktionen.every((aktion) => aktion.zustand === "geplant")).toBe(true);
    expect(auftrag.zustand).toBe("plan_bereit");
  });

  it("bindet nur vorhandene Verbindungen und erfindet keine Ausführung", () => {
    const auftrag = surfaceAuftragPlanen(
      "nutzer-1",
      "Angebot für Werkstätten, die Termin-Anfragen sammeln wollen.",
      [{
        version: 1,
        id: "gh-1",
        anbieter: "github",
        modus: "oauth",
        konto_ref: "octo",
        status: "verbunden",
        scopes: ["repo"],
        ressourcen: [{ id: "repo-1", art: "repo", name: "Firma" }],
      }],
    );
    expect(auftrag.aktionen[0]?.verbindung_ids).toEqual(["gh-1"]);
    expect(auftrag.aktionen[1]?.verbindung_ids).toEqual([]);
    expect(auftrag.ereignisse.every((ereignis) => ereignis.typ === "auftrag_erstellt" || ereignis.typ === "plan_geaendert")).toBe(true);
  });
});
