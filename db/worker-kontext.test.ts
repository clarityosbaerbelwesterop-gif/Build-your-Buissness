import { describe, expect, it } from "vitest";

import type { SqlVerbindung } from "./auth-kontext.js";
import { mitWorkerTransaktion } from "./worker-kontext.js";

function verbindungMitAufzeichnung(fehlermodus = false): {
  readonly db: SqlVerbindung;
  readonly sql: string[];
} {
  const sql: string[] = [];
  return {
    sql,
    db: {
      async query(abfrage: string) {
        sql.push(abfrage);
        if (fehlermodus && abfrage === "arbeit") throw new Error("kaputt");
        return { rows: [] };
      },
    },
  };
}

describe("Worker-Kontext", () => {
  it("reduziert die Transaktion auf byb_worker und committet", async () => {
    const { db, sql } = verbindungMitAufzeichnung();

    const ergebnis = await mitWorkerTransaktion(db, async (tx) => {
      await tx.query("arbeit");
      return "ok";
    });

    expect(ergebnis).toBe("ok");
    expect(sql).toEqual(["begin", "set local role byb_worker", "arbeit", "commit"]);
  });

  it("rollt bei Fehlern zurück", async () => {
    const { db, sql } = verbindungMitAufzeichnung(true);

    await expect(
      mitWorkerTransaktion(db, async (tx) => {
        await tx.query("arbeit");
      }),
    ).rejects.toThrow("kaputt");

    expect(sql).toEqual(["begin", "set local role byb_worker", "arbeit", "rollback"]);
  });
});
