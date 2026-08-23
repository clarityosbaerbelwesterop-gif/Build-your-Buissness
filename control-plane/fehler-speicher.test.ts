import { describe, expect, it } from "vitest";

import { Auftrag, type Auftrag as AuftragTyp } from "./v1.js";
import { aktionMitLeaseFehlerSpeichern } from "./fehler-speicher.js";

const TOKEN = "11111111-1111-4111-8111-111111111111";

function laufenderAuftrag(): AuftragTyp {
  return Auftrag.parse({
    version: 1,
    id: "auftrag-1",
    projekt_id: "projekt-1",
    nutzer_id: "nutzer-1",
    ziel: "BYB soll einen Worker-Fehler persistent und begrenzt verarbeiten.",
    zustand: "laeuft",
    credit_deckel: 20,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: "repo",
        typ: "repo",
        titel: "Arbeitsbranch vorbereiten",
        beschreibung: "BYB bereitet einen isolierten Arbeitsbranch vor.",
        zustand: "laeuft",
        abhaengigkeiten: [],
        verbindung_ids: ["github-1"],
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 2,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [],
  });
}

function dbFuerVersuch(versuche: number) {
  const auftrag = laufenderAuftrag();
  const protokoll: Array<{ sql: string; werte?: readonly unknown[] }> = [];
  return {
    protokoll,
    db: {
      query(sql: string, werte?: readonly unknown[]) {
        protokoll.push(werte === undefined ? { sql } : { sql, werte });
        if (sql.includes("select a.nutzer_id, a.inhalt, x.versuche")) {
          return Promise.resolve({
            rows: [{ nutzer_id: auftrag.nutzer_id, inhalt: auftrag, versuche }],
          });
        }
        if (sql.includes("update steuer_auftraege set")) {
          return Promise.resolve({ rows: [{ id: auftrag.id }] });
        }
        if (sql.includes("update steuer_aktionen set")) {
          return Promise.resolve({ rows: [{ aktion_id: "repo" }] });
        }
        return Promise.resolve({ rows: [] });
      },
    },
  };
}

describe("Persistente Worker-Fehler", () => {
  it("setzt einen frühen Fehlversuch atomar zurück in die Queue und räumt die Lease auf", async () => {
    const { db, protokoll } = dbFuerVersuch(1);

    const ergebnis = await aktionMitLeaseFehlerSpeichern(
      db,
      "auftrag-1",
      "repo",
      TOKEN,
      "Provider antwortete vorübergehend nicht.",
      3,
      1000,
    );

    expect(ergebnis.wiederholen).toBe(true);
    expect(ergebnis.versuch).toBe(1);
    expect(ergebnis.auftrag.aktionen[0]?.zustand).toBe("geplant");
    expect(protokoll.some((eintrag) => eintrag.sql === "begin")).toBe(true);
    expect(protokoll.some((eintrag) => eintrag.sql === "set local role byb_worker")).toBe(true);
    const aktionsUpdate = protokoll.find((eintrag) => eintrag.sql.includes("update steuer_aktionen set"));
    expect(aktionsUpdate?.sql).toContain("lease_token = null");
    expect(aktionsUpdate?.werte?.[3]).toBe("geplant");
    const eventInsert = protokoll.find((eintrag) => eintrag.sql.includes("insert into steuer_ereignisse"));
    expect(eventInsert?.werte?.[3]).toBe("plan_geaendert");
    expect(protokoll.at(-1)?.sql).toBe("commit");
  });

  it("persistiert den dritten Fehlversuch als terminales Dead Letter", async () => {
    const { db, protokoll } = dbFuerVersuch(3);

    const ergebnis = await aktionMitLeaseFehlerSpeichern(
      db,
      "auftrag-1",
      "repo",
      TOKEN,
      "Provider blieb nach Wiederholungen nicht erreichbar.",
      3,
      1000,
    );

    expect(ergebnis.wiederholen).toBe(false);
    expect(ergebnis.auftrag.zustand).toBe("fehlgeschlagen");
    expect(ergebnis.auftrag.aktionen[0]?.zustand).toBe("fehlgeschlagen");
    const auftragsUpdate = protokoll.find((eintrag) => eintrag.sql.includes("update steuer_auftraege set"));
    expect(auftragsUpdate?.werte?.[1]).toBe("fehlgeschlagen");
    const eventInsert = protokoll.find((eintrag) => eintrag.sql.includes("insert into steuer_ereignisse"));
    expect(eventInsert?.werte?.[3]).toBe("aktion_fehlgeschlagen");
  });
});
