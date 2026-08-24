import { describe, expect, it } from "vitest";

import type { ConnectorVerbindung } from "../connector-hub/v1.js";
import { auftragAusZielPlanen, verbindungenFuerAktion } from "./planer.js";

const verbindungen: ConnectorVerbindung[] = [
  {
    version: 1,
    id: "gh-1",
    anbieter: "github",
    modus: "oauth",
    konto_ref: "octo",
    status: "verbunden",
    scopes: ["repo"],
    ressourcen: [{ id: "repo-1", art: "repo", name: "Firma" }],
  },
  {
    version: 1,
    id: "vercel-1",
    anbieter: "vercel",
    modus: "oauth",
    konto_ref: "team-1",
    status: "verbunden",
    scopes: [],
    ressourcen: [{ id: "project-1", art: "vercel_projekt", name: "Firma" }],
  },
  {
    version: 1,
    id: "stripe-1",
    anbieter: "stripe",
    modus: "oauth",
    konto_ref: "acct_1",
    status: "erneut_anmelden",
    scopes: [],
    ressourcen: [{ id: "acct_1", art: "stripe_konto", name: "Firma" }],
  },
];

describe("Control-Plane Planer", () => {
  it("bindet nur arbeitsbereite Verbindungen an passende Aktionen", () => {
    expect(verbindungenFuerAktion("code", verbindungen)).toEqual(["gh-1"]);
    expect(verbindungenFuerAktion("deploy", verbindungen)).toEqual(["vercel-1"]);
    expect(verbindungenFuerAktion("payments", verbindungen)).toEqual([]);
  });

  it("validiert Modell-JSON und baut einen echten Auftrag ohne erfundene Ausführung", async () => {
    const auftrag = await auftragAusZielPlanen(
      "nutzer-1",
      "Baue eine Landingpage, teste sie und bereite den Deploy vor.",
      200,
      verbindungen,
      {
        idErzeugen: () => "fest",
        jetzt: () => 1_000,
        fragenImpl: async () => ({
          text: JSON.stringify({
            aktionen: [
              {
                typ: "code",
                titel: "Landingpage bauen",
                beschreibung: "BYB erstellt die benötigten Dateien im ausgewählten Repository.",
                abhaengigkeiten: [],
              },
              {
                typ: "test",
                titel: "Änderung prüfen",
                beschreibung: "BYB führt die automatisierten Prüfungen für die Änderung aus.",
                abhaengigkeiten: [0],
              },
              {
                typ: "deploy",
                titel: "Preview veröffentlichen",
                beschreibung: "BYB bereitet die geprüfte Fassung für die Veröffentlichung vor.",
                abhaengigkeiten: [1],
              },
            ],
          }),
          tokensEin: 10,
          tokensAus: 20,
          modell: "test",
        }),
      },
    );

    expect(auftrag.id).toBe("auftrag-fest");
    expect(auftrag.zustand).toBe("plan_bereit");
    expect(auftrag.aktionen.map((aktion) => aktion.zustand)).toEqual([
      "geplant",
      "geplant",
      "geplant",
    ]);
    expect(auftrag.aktionen[0]?.verbindung_ids).toEqual(["gh-1"]);
    expect(auftrag.aktionen[2]?.verbindung_ids).toEqual(["vercel-1"]);
    expect(auftrag.aktionen[2]?.freigabe).toEqual({ klasse: "extern", status: "offen" });
    expect(auftrag.ereignisse.map((ereignis) => ereignis.typ)).toEqual([
      "auftrag_erstellt",
      "plan_geaendert",
    ]);
  });

  it("verwirft Vorwärtsabhängigkeiten aus einer Modellantwort", async () => {
    await expect(
      auftragAusZielPlanen(
        "nutzer-1",
        "Baue eine kleine Anwendung und prüfe sie anschließend.",
        100,
        [],
        {
          fragenImpl: async () => ({
            text: JSON.stringify({
              aktionen: [
                {
                  typ: "code",
                  titel: "Anwendung bauen",
                  beschreibung: "BYB erstellt die geplante Anwendung.",
                  abhaengigkeiten: [1],
                },
                {
                  typ: "test",
                  titel: "Anwendung prüfen",
                  beschreibung: "BYB prüft die Anwendung automatisiert.",
                  abhaengigkeiten: [],
                },
              ],
            }),
            tokensEin: 1,
            tokensAus: 1,
            modell: "test",
          }),
        },
      ),
    ).rejects.toThrow(/Abhängigkeiten/);
  });
});
