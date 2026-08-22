import { describe, expect, it } from "vitest";

import {
  identitaetNachVerifikation,
  mitNutzerTransaktion,
  type SqlErgebnis,
  type SqlVerbindung,
} from "./auth-kontext.js";

class Attrappe implements SqlVerbindung {
  readonly aufrufe: { sql: string; werte: unknown[] }[] = [];
  fehlerBei?: string;

  query(sql: string, werte: unknown[] = []): Promise<SqlErgebnis> {
    this.aufrufe.push({ sql, werte });
    if (this.fehlerBei !== undefined && sql.includes(this.fehlerBei)) {
      throw new Error("absichtlicher Testfehler");
    }
    return Promise.resolve({ rows: [] });
  }
}

describe("Auth-Kontext", () => {
  it("setzt Rolle und sub nur innerhalb einer Transaktion", async () => {
    const db = new Attrappe();
    const identitaet = identitaetNachVerifikation("nutzer-123");

    const wert = await mitNutzerTransaktion(db, identitaet, async (v) => {
      await v.query("select 1");
      return 42;
    });

    expect(wert).toBe(42);
    expect(db.aufrufe.map((a) => a.sql)).toEqual([
      "begin",
      "set local role byb_app",
      "select set_config('request.jwt.claims', $1, true)",
      "select 1",
      "commit",
    ]);
    expect(db.aufrufe[2]?.werte).toEqual([JSON.stringify({ sub: "nutzer-123" })]);
  });

  it("rollt bei einem Fehler zurück", async () => {
    const db = new Attrappe();
    db.fehlerBei = "kaputt";

    await expect(
      mitNutzerTransaktion(db, identitaetNachVerifikation("nutzer-a"), async (v) => {
        await v.query("select kaputt");
      }),
    ).rejects.toThrow("absichtlicher Testfehler");

    expect(db.aufrufe.at(-1)?.sql).toBe("rollback");
    expect(db.aufrufe.some((a) => a.sql === "commit")).toBe(false);
  });

  it("lehnt eine leere Nutzerkennung ab", () => {
    expect(() => identitaetNachVerifikation("   ")).toThrow();
  });
});
