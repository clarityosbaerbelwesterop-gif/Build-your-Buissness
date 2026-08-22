import { describe, expect, it } from "vitest";
import {
  Auftrag,
  BackendAuswahl,
  Projekt,
  Verbindung,
  aktionAbschliessen,
  aktionStarten,
  freigabeErteilen,
  naechsteAktionen,
  type Auftrag as AuftragTyp,
} from "./v1.js";

function beispielAuftrag(): AuftragTyp {
  return Auftrag.parse({
    version: 1,
    id: "auftrag-1",
    projekt_id: "projekt-1",
    nutzer_id: "nutzer-1",
    ziel: "Baue die Anwendung, prüfe sie und veröffentliche die geprüfte Fassung.",
    zustand: "plan_bereit",
    credit_deckel: 100,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: "code",
        typ: "code",
        titel: "Produkt bauen",
        beschreibung: "BYB schreibt die geplanten Änderungen im Arbeitsbranch.",
        zustand: "geplant",
        abhaengigkeiten: [],
        verbindung_ids: ["github-1"],
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 30,
        credits_verbraucht: 0,
      },
      {
        id: "deploy",
        typ: "deploy",
        titel: "Produkt veröffentlichen",
        beschreibung: "BYB veröffentlicht die geprüfte Fassung über Vercel.",
        zustand: "geplant",
        abhaengigkeiten: ["code"],
        verbindung_ids: ["vercel-1"],
        freigabe: { klasse: "extern", status: "offen" },
        credits_geschaetzt: 20,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [],
  });
}

describe("Control Plane v1", () => {
  it("modelliert GitHub, Vercel und genau einen Backend-Anbieter", () => {
    const neon = BackendAuswahl.parse({
      anbieter: "neon",
      verbindung_id: "neon-1",
      ressourcen_id: "projekt-neon",
    });
    const supabase = BackendAuswahl.parse({
      anbieter: "supabase",
      verbindung_id: "supabase-1",
      ressourcen_id: "projekt-supabase",
    });

    expect(neon.anbieter).toBe("neon");
    expect(supabase.anbieter).toBe("supabase");

    expect(
      Projekt.parse({
        id: "projekt-1",
        nutzer_id: "nutzer-1",
        name: "Mein Unternehmen",
        github: { verbindung_id: "github-1", ressourcen_id: "repo-1" },
        vercel: { verbindung_id: "vercel-1", ressourcen_id: "vercel-projekt" },
        backend: neon,
        optionale_verbindungen: ["stripe-1"],
      }).backend.anbieter,
    ).toBe("neon");
  });

  it("nimmt in einer Verbindung keine Tokens oder anderen unbekannten Felder an", () => {
    expect(() =>
      Verbindung.parse({
        id: "github-1",
        anbieter: "github",
        art: "oauth",
        konto_ref: "konto-123",
        zustand: "verbunden",
        ressourcen: [{ id: "repo-1", art: "repo", name: "Firma" }],
        access_token: "darf-hier-nicht-stehen",
      }),
    ).toThrow();
  });

  it("startet interne Arbeit autonom", () => {
    const auftrag = beispielAuftrag();
    expect(naechsteAktionen(auftrag).map((aktion) => aktion.id)).toEqual(["code"]);

    const gestartet = aktionStarten(auftrag, "code", 1000);
    expect(gestartet.zustand).toBe("laeuft");
    expect(gestartet.aktionen[0]?.zustand).toBe("laeuft");
    expect(gestartet.ereignisse[0]?.klartext).toContain("Produkt bauen");
  });

  it("wechselt nach interner Arbeit sichtbar in den Freigabezustand", () => {
    let auftrag = beispielAuftrag();
    auftrag = aktionStarten(auftrag, "code", 1000);
    auftrag = aktionAbschliessen(auftrag, "code", "Code und Tests abgeschlossen.", 27, 1001);

    expect(auftrag.zustand).toBe("wartet_freigabe");
    expect(naechsteAktionen(auftrag)).toHaveLength(0);

    auftrag = freigabeErteilen(auftrag, "deploy", "deploy-dauerfreigabe", 1002);
    expect(auftrag.zustand).toBe("laeuft");
    expect(naechsteAktionen(auftrag).map((aktion) => aktion.id)).toEqual(["deploy"]);
  });

  it("startet externe Arbeit weder vor Abhängigkeit noch vor Freigabe", () => {
    let auftrag = beispielAuftrag();
    expect(() => aktionStarten(auftrag, "deploy", 1000)).toThrow(/noch nicht startbar/);

    auftrag = aktionStarten(auftrag, "code", 1001);
    auftrag = aktionAbschliessen(auftrag, "code", "Code und Tests abgeschlossen.", 27, 1002);

    expect(naechsteAktionen(auftrag)).toHaveLength(0);
    expect(() => aktionStarten(auftrag, "deploy", 1003)).toThrow(/noch nicht startbar/);

    auftrag = freigabeErteilen(auftrag, "deploy", "deploy-dauerfreigabe", 1004);
    expect(naechsteAktionen(auftrag).map((aktion) => aktion.id)).toEqual(["deploy"]);
  });

  it("dokumentiert Freigabe, Ausführung, Ergebnis und tatsächliche Credits", () => {
    let auftrag = beispielAuftrag();
    auftrag = aktionStarten(auftrag, "code", 1000);
    auftrag = aktionAbschliessen(auftrag, "code", "Änderungen geprüft.", 24, 1001);
    auftrag = freigabeErteilen(auftrag, "deploy", "deploy-einmal", 1002);
    auftrag = aktionStarten(auftrag, "deploy", 1003);
    auftrag = aktionAbschliessen(auftrag, "deploy", "Deployment erreichbar.", 18, 1004);

    expect(auftrag.zustand).toBe("abgeschlossen");
    expect(auftrag.credits_verbraucht).toBe(42);
    expect(auftrag.aktionen[1]?.credits_verbraucht).toBe(18);
    expect(auftrag.ereignisse.map((ereignis) => ereignis.typ)).toEqual([
      "aktion_gestartet",
      "aktion_abgeschlossen",
      "freigabe_erteilt",
      "aktion_gestartet",
      "aktion_abgeschlossen",
    ]);
  });

  it("blockiert eine neue Aktion, wenn ihre Schätzung den Credit-Deckel sprengt", () => {
    const auftrag = Auftrag.parse({
      ...beispielAuftrag(),
      credit_deckel: 20,
    });

    expect(naechsteAktionen(auftrag)).toHaveLength(0);
    expect(() => aktionStarten(auftrag, "code", 1000)).toThrow(/noch nicht startbar/);
  });

  it("akzeptiert keine unbekannten oder selbstreferenziellen Abhängigkeiten", () => {
    const basis = beispielAuftrag();

    expect(() =>
      Auftrag.parse({
        ...basis,
        aktionen: [
          {
            ...basis.aktionen[0],
            abhaengigkeiten: ["fehlt"],
          },
          basis.aktionen[1],
        ],
      }),
    ).toThrow(/Abhängigkeiten/);

    expect(() =>
      Auftrag.parse({
        ...basis,
        aktionen: [
          {
            ...basis.aktionen[0],
            abhaengigkeiten: ["code"],
          },
          basis.aktionen[1],
        ],
      }),
    ).toThrow(/Abhängigkeiten/);
  });

  it("verwirft zyklische Aktionspläne statt sie dauerhaft festzufahren", () => {
    const basis = beispielAuftrag();

    expect(() =>
      Auftrag.parse({
        ...basis,
        aktionen: [
          { ...basis.aktionen[0], abhaengigkeiten: ["deploy"] },
          { ...basis.aktionen[1], abhaengigkeiten: ["code"] },
        ],
      }),
    ).toThrow(/Zyklus/);
  });

  it("akzeptiert keine doppelten Aktions-IDs", () => {
    const basis = beispielAuftrag();
    expect(() =>
      Auftrag.parse({
        ...basis,
        aktionen: [basis.aktionen[0], { ...basis.aktionen[1], id: "code" }],
      }),
    ).toThrow(/eindeutig/);
  });

  it("erzwingt Freigabegrenzen für externe und finanzielle Aktionen", () => {
    const basis = beispielAuftrag();
    expect(() =>
      Auftrag.parse({
        ...basis,
        aktionen: [
          basis.aktionen[0],
          {
            ...basis.aktionen[1],
            freigabe: { klasse: "finanziell", status: "nicht_erforderlich" },
          },
        ],
      }),
    ).toThrow(/Freigabegrenze/);
  });
});
