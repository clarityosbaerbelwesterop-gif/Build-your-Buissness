import { describe, expect, it } from "vitest";

import { identitaetNachVerifikation, type SqlVerbindung } from "../db/auth-kontext.js";
import {
  auftragLaden,
  auftragSpeichern,
  naechsteAktionLeasen,
} from "./speicher.js";
import { Auftrag, type Auftrag as AuftragTyp } from "./v1.js";

function beispiel(nutzerId = "nutzer-1"): AuftragTyp {
  return Auftrag.parse({
    version: 1,
    id: "auftrag-1",
    projekt_id: "projekt-1",
    nutzer_id: nutzerId,
    ziel: "Baue und prüfe die Anwendung vollständig im Hintergrund.",
    zustand: "plan_bereit",
    credit_deckel: 100,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: "code",
        typ: "code",
        titel: "Produkt bauen",
        beschreibung: "BYB schreibt und prüft die geplanten Änderungen.",
        zustand: "geplant",
        abhaengigkeiten: [],
        verbindung_ids: ["github-1"],
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 20,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [],
  });
}

function leereVerbindung(): { readonly db: SqlVerbindung; readonly aufrufe: string[] } {
  const aufrufe: string[] = [];
  return {
    aufrufe,
    db: {
      async query(sql: string) {
        aufrufe.push(sql);
        return { rows: [] };
      },
    },
  };
}

describe("Control-Plane-Speicher", () => {
  it("schreibt keinen Auftrag für eine andere als die verifizierte Identität", async () => {
    const { db, aufrufe } = leereVerbindung();
    const identitaet = identitaetNachVerifikation("nutzer-a");

    await expect(auftragSpeichern(db, identitaet, beispiel("nutzer-b"))).rejects.toThrow(
      /verifizierte Nutzerkennung/,
    );
    expect(aufrufe).toEqual([]);
  });

  it("liest auch einen fehlenden Auftrag ausschließlich im Nutzer-RLS-Kontext", async () => {
    const { db, aufrufe } = leereVerbindung();
    const identitaet = identitaetNachVerifikation("nutzer-a");

    await expect(auftragLaden(db, identitaet, "fehlt")).resolves.toBeUndefined();
    expect(aufrufe[0]).toBe("begin");
    expect(aufrufe[1]).toBe("set local role byb_app");
    expect(aufrufe[2]).toContain("set_config('request.jwt.claims'");
    expect(aufrufe[3]).toContain("from steuer_auftraege");
    expect(aufrufe[4]).toBe("commit");
  });

  it("validiert Worker-ID und Lease-Dauer vor jedem Datenbankzugriff", async () => {
    const { db, aufrufe } = leereVerbindung();

    await expect(naechsteAktionLeasen(db, "", 60_000)).rejects.toThrow();
    await expect(naechsteAktionLeasen(db, "worker", 99)).rejects.toThrow();
    expect(aufrufe).toEqual([]);
  });

  it("sucht Hintergrundarbeit nur innerhalb des begrenzten Worker-Kontexts", async () => {
    const { db, aufrufe } = leereVerbindung();

    await expect(naechsteAktionLeasen(db, "worker", 60_000, 1000)).resolves.toBeUndefined();
    expect(aufrufe[0]).toBe("begin");
    expect(aufrufe[1]).toBe("set local role byb_worker");
    expect(aufrufe[2]).toContain("from steuer_auftraege");
    expect(aufrufe[3]).toBe("commit");
  });
});
