import { describe, expect, it } from "vitest";

import type { Protokoll } from "../protocol/v1.js";
import { identitaetNachVerifikation, type SqlErgebnis, type SqlVerbindung } from "./auth-kontext.js";
import { protokollLaden, protokollSpeichern } from "./protokoll-speicher.js";

const LAUF = "11111111-1111-4111-8111-111111111111";

function beispiel(): Protokoll {
  const befund = {
    id: `${LAUF}-1`,
    kategorie: "zugangsdaten" as const,
    angriffsklasse: "quelltext-schluessel",
    schweregrad: "hoch" as const,
    klartext: "Ein Zugangswert stand direkt im Quelltext der geprüften Anwendung.",
    nachweis: "src/config.ts:7",
    zustand: "behoben" as const,
    runde: 1,
    zeitstempel: 1_780_000_000_100,
  };
  return {
    version: 1,
    lauf_id: LAUF,
    begonnen: 1_780_000_000_000,
    beendet: 1_780_000_000_500,
    gelaufene_klassen: ["quelltext-schluessel"],
    runden: [{
      nummer: 1,
      gelaufene_klassen: ["quelltext-schluessel"],
      befunde: [befund],
      kosten: { tokens_ein: 10, tokens_aus: 5, laufzeit_ms: 500 },
    }],
    befunde: [befund],
    endzustand: "sauber",
    abbruchgrund: "keine_offenen_befunde",
    kosten_gesamt: { tokens_ein: 10, tokens_aus: 5, laufzeit_ms: 500 },
  };
}

class SpeicherAttrappe implements SqlVerbindung {
  readonly aufrufe: { sql: string; werte: unknown[] }[] = [];
  ladeInhalt: unknown;

  async query(sql: string, werte: unknown[] = []): Promise<SqlErgebnis> {
    this.aufrufe.push({ sql, werte });
    if (sql.includes("insert into protokolle")) {
      return { rows: [{ id: "22222222-2222-4222-8222-222222222222" }] };
    }
    if (sql.startsWith("select inhalt")) {
      return this.ladeInhalt === undefined ? { rows: [] } : { rows: [{ inhalt: this.ladeInhalt }] };
    }
    return { rows: [] };
  }
}

describe("Protokoll-Persistenz", () => {
  it("schreibt kanonisches JSON und relationale Projektionen in einer Transaktion", async () => {
    const db = new SpeicherAttrappe();
    const protokoll = beispiel();

    const gespeichert = await protokollSpeichern(
      db,
      identitaetNachVerifikation("nutzer-a"),
      protokoll,
      "Testlauf",
    );

    expect(gespeichert).toEqual(protokoll);
    expect(db.aufrufe.map((a) => a.sql).join("\n")).toContain("insert into laeufe");
    expect(db.aufrufe.map((a) => a.sql).join("\n")).toContain("insert into protokolle");
    expect(db.aufrufe.map((a) => a.sql).join("\n")).toContain("insert into runden");
    expect(db.aufrufe.map((a) => a.sql).join("\n")).toContain("insert into befunde");
    const protokollAufruf = db.aufrufe.find((a) => a.sql.includes("insert into protokolle"));
    expect(protokollAufruf?.werte.at(-1)).toBe(JSON.stringify(protokoll));
    expect(db.aufrufe.at(-1)?.sql).toBe("commit");
  });

  it("liest das gespeicherte JSON erneut durch den v1-Vertrag", async () => {
    const db = new SpeicherAttrappe();
    db.ladeInhalt = JSON.stringify(beispiel());

    const gelesen = await protokollLaden(
      db,
      identitaetNachVerifikation("nutzer-a"),
      LAUF,
    );

    expect(gelesen).toEqual(beispiel());
  });

  it("liefert undefined, wenn RLS keine Zeile sichtbar macht", async () => {
    const db = new SpeicherAttrappe();

    const gelesen = await protokollLaden(
      db,
      identitaetNachVerifikation("nutzer-fremd"),
      LAUF,
    );

    expect(gelesen).toBeUndefined();
  });

  it("lehnt eine Laufkennung außerhalb des DB-Vertrags vor dem Schreiben ab", async () => {
    const db = new SpeicherAttrappe();
    const protokoll = { ...beispiel(), lauf_id: "lauf-1" };

    await expect(
      protokollSpeichern(db, identitaetNachVerifikation("nutzer-a"), protokoll, "Testlauf"),
    ).rejects.toThrow();
    expect(db.aufrufe).toEqual([]);
  });
});
