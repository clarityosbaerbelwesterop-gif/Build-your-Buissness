import { describe, expect, it } from "vitest";

import type { Protokoll } from "../protocol/v1.js";
import { identitaetNachVerifikation, type SqlErgebnis, type SqlVerbindung } from "../db/auth-kontext.js";
import { AuthTokenFehler, type TokenPruefer } from "./neon-jwt.js";
import { protokollLadenMitBearer, protokollSpeichernMitBearer } from "./protokoll-zugriff.js";

const LAUF = "11111111-1111-4111-8111-111111111111";

function beispiel(): Protokoll {
  return {
    version: 1,
    lauf_id: LAUF,
    begonnen: 1_780_000_000_000,
    beendet: 1_780_000_000_500,
    gelaufene_klassen: ["auth-grenze"],
    runden: [],
    befunde: [],
    endzustand: "sauber",
    abbruchgrund: "keine_offenen_befunde",
    kosten_gesamt: { tokens_ein: 0, tokens_aus: 0, laufzeit_ms: 500 },
  };
}

class DbAttrappe implements SqlVerbindung {
  readonly aufrufe: { sql: string; werte: unknown[] }[] = [];
  ladeInhalt: unknown;

  query(sql: string, werte: unknown[] = []): Promise<SqlErgebnis> {
    this.aufrufe.push({ sql, werte });
    if (sql.includes("insert into protokolle")) {
      return Promise.resolve({ rows: [{ id: "22222222-2222-4222-8222-222222222222" }] });
    }
    if (sql.startsWith("select inhalt")) {
      return Promise.resolve(
        this.ladeInhalt === undefined ? { rows: [] } : { rows: [{ inhalt: this.ladeInhalt }] },
      );
    }
    return Promise.resolve({ rows: [] });
  }
}

function akzeptiert(nutzerId: string, gesehen: string[]): TokenPruefer {
  return (token) => {
    gesehen.push(token);
    return Promise.resolve(identitaetNachVerifikation(nutzerId));
  };
}

describe("Bearer-Token bis Protokollspeicher", () => {
  it("reicht nach der Prüfung nur die Nutzerkennung an den DB-Kontext weiter", async () => {
    const db = new DbAttrappe();
    const gesehen: string[] = [];
    const token = "abc.def.ghi-0123456789";

    await protokollSpeichernMitBearer(
      db,
      `Bearer ${token}`,
      akzeptiert("nutzer-a", gesehen),
      beispiel(),
      "M0.7-Test",
    );

    expect(gesehen).toEqual([token]);
    const kontext = db.aufrufe.find((a) => a.sql.includes("request.jwt.claims"));
    expect(kontext?.werte).toEqual([JSON.stringify({ sub: "nutzer-a" })]);
    expect(JSON.stringify(db.aufrufe)).not.toContain(token);
  });

  it("berührt die Datenbank nicht, wenn die Tokenprüfung ablehnt", async () => {
    const db = new DbAttrappe();
    const ablehnen: TokenPruefer = () => Promise.reject(new AuthTokenFehler());

    await expect(
      protokollLadenMitBearer(db, "Bearer abc.def.ghi-0123456789", ablehnen, LAUF),
    ).rejects.toBeInstanceOf(AuthTokenFehler);
    expect(db.aufrufe).toEqual([]);
  });

  it("berührt Prüfer und Datenbank nicht bei einem falschen Authorization-Schema", async () => {
    const db = new DbAttrappe();
    const gesehen: string[] = [];

    await expect(
      protokollLadenMitBearer(db, "Basic abc.def.ghi-0123456789", akzeptiert("nutzer-a", gesehen), LAUF),
    ).rejects.toBeInstanceOf(AuthTokenFehler);
    expect(gesehen).toEqual([]);
    expect(db.aufrufe).toEqual([]);
  });

  it("liest nach erfolgreicher Prüfung über denselben RLS-Pfad", async () => {
    const db = new DbAttrappe();
    const protokoll = beispiel();
    db.ladeInhalt = JSON.stringify(protokoll);

    const gelesen = await protokollLadenMitBearer(
      db,
      "Bearer abc.def.ghi-0123456789",
      akzeptiert("nutzer-a", []),
      LAUF,
    );

    expect(gelesen).toEqual(protokoll);
  });
});
