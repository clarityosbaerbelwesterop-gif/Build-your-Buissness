/**
 * Die Prüflogik gegen eine Attrappe.
 *
 * Der Nachweis selbst läuft gegen einen echten Neon-Zweig (`db/rls-nachweis.ts`,
 * eigener CI-Lauf). Hier geht es um die Frage davor: **schlägt die Prüfung
 * überhaupt an?** Eine Sicherheitsprüfung, die nichts findet, sieht genauso
 * aus wie eine, die nicht funktioniert — und der Unterschied ist der ganze
 * Wert des Berichts.
 *
 * Die Attrappe bildet Postgres nicht nach. Sie tut nur so, als griffe die
 * Regel — oder eben nicht, je Fall genau einer.
 */

import { describe, expect, it, vi } from "vitest";

import type { Verbindung } from "./rls-pruefung.js";
import { MANDANT_A, MANDANT_B, alsMandant, bericht, tabellePruefen } from "./rls-pruefung.js";

/**
 * Eine Datenbank, die Zeilen als Paare (id, nutzer_id) hält und die Policy
 * nach den übergebenen Schaltern anwendet.
 */
function attrappe(optionen: {
  readonly trenntBeimLesen?: boolean;
  readonly trenntBeimAendern?: boolean;
  readonly trenntBeimLoeschen?: boolean;
  readonly trenntBeimSchreiben?: boolean;
} = {}) {
  const {
    trenntBeimLesen = true,
    trenntBeimAendern = true,
    trenntBeimLoeschen = true,
    trenntBeimSchreiben = true,
  } = optionen;

  const zeilen = new Map<string, string>();
  let mandant = "";
  let zaehler = 0;

  const verbindung: Verbindung = {
    query(sql: string, werte: readonly unknown[] = []) {
      const s = sql.trim().toLowerCase();

      if (s.startsWith("begin") || s.startsWith("commit") || s.startsWith("rollback")) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (s.includes("set_config")) {
        const roh = werte[0];
        mandant = typeof roh === "string"
          ? String((JSON.parse(roh) as { sub?: unknown }).sub)
          : "";
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      if (s.startsWith("insert")) {
        zaehler += 1;
        const id = `zeile-${zaehler}`;
        zeilen.set(id, String(werte[0]));
        return Promise.resolve({ rows: [{ id }], rowCount: 1 });
      }
      if (s.startsWith("select count")) {
        const id = String(werte[0]);
        const eigner = zeilen.get(id);
        const sichtbar = eigner !== undefined
          && (trenntBeimLesen ? eigner === mandant : true);
        return Promise.resolve({ rows: [{ anzahl: sichtbar ? 1 : 0 }], rowCount: 1 });
      }
      if (s.startsWith("update") && s.includes("set nutzer_id = $1")) {
        // Auf fremde Kennung schreiben — das ist WITH CHECK.
        const id = String(werte[1]);
        const eigner = zeilen.get(id);
        if (eigner !== mandant) return Promise.resolve({ rows: [], rowCount: 0 });
        if (trenntBeimSchreiben) return Promise.resolve({ rows: [], rowCount: 0 });
        zeilen.set(id, String(werte[0]));
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (s.startsWith("update")) {
        const id = String(werte[0]);
        const eigner = zeilen.get(id);
        const darf = eigner !== undefined
          && (trenntBeimAendern ? eigner === mandant : true);
        return Promise.resolve({ rows: [], rowCount: darf ? 1 : 0 });
      }
      if (s.startsWith("delete")) {
        const id = String(werte[0]);
        const eigner = zeilen.get(id);
        const darf = eigner !== undefined
          && (trenntBeimLoeschen ? eigner === mandant : true);
        if (darf) zeilen.delete(id);
        return Promise.resolve({ rows: [], rowCount: darf ? 1 : 0 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };

  const anlegen = (m: string): Promise<string> =>
    verbindung.query("insert into t (nutzer_id) values ($1) returning id", [m])
      .then((e) => String(e.rows[0]?.["id"]));

  return { verbindung, anlegen };
}

describe("tabellePruefen findet nichts, wenn die Trennung greift", () => {
  it("meldet keinen Verstoß bei sauberer Policy", async () => {
    const { verbindung, anlegen } = attrappe();
    expect(await tabellePruefen(verbindung, "t", anlegen)).toEqual([]);
  });
});

describe("tabellePruefen schlägt an, wenn eine Trennung fehlt", () => {
  it("meldet den Leseweg", async () => {
    // Das ist der Fall „ENABLE ohne FORCE": die Regel steht da, der Eigentümer
    // umgeht sie, und die Anwendung meldet sich fast immer als Eigentümer an.
    const { verbindung, anlegen } = attrappe({ trenntBeimLesen: false });
    const verstoesse = await tabellePruefen(verbindung, "t", anlegen);
    expect(verstoesse.map((v) => v.weg)).toContain("lesen");
  });

  it("meldet den Änderungsweg", async () => {
    const { verbindung, anlegen } = attrappe({ trenntBeimAendern: false });
    const verstoesse = await tabellePruefen(verbindung, "t", anlegen);
    expect(verstoesse.map((v) => v.weg)).toContain("aendern");
  });

  it("meldet den Löschweg", async () => {
    const { verbindung, anlegen } = attrappe({ trenntBeimLoeschen: false });
    const verstoesse = await tabellePruefen(verbindung, "t", anlegen);
    expect(verstoesse.map((v) => v.weg)).toContain("loeschen");
  });

  it("meldet fehlendes WITH CHECK, das eine Leseprüfung nie fände", async () => {
    // Ohne WITH CHECK kann jeder Zeilen auf eine fremde Kennung legen, ohne
    // sie je zu sehen. Wer nur liest, findet das nicht.
    const { verbindung, anlegen } = attrappe({ trenntBeimSchreiben: false });
    const verstoesse = await tabellePruefen(verbindung, "t", anlegen);
    expect(verstoesse.map((v) => v.weg)).toContain("fremd_anlegen");
  });

  it("meldet alle Wege, wenn gar keine Regel greift", async () => {
    const { verbindung, anlegen } = attrappe({
      trenntBeimLesen: false,
      trenntBeimAendern: false,
      trenntBeimLoeschen: false,
      trenntBeimSchreiben: false,
    });
    const wege = (await tabellePruefen(verbindung, "t", anlegen)).map((v) => v.weg);
    expect(wege).toEqual(
      expect.arrayContaining(["lesen", "aendern", "loeschen", "fremd_anlegen"]),
    );
  });

  it("meldet, wenn die fremde Zeile am Ende weg ist", async () => {
    // Gegenprobe zum Löschweg: `rowCount 0` beim DELETE könnte auch heißen,
    // dass die Zeile nie existiert hat. Dann wäre der Test grün, ohne etwas
    // geprüft zu haben.
    const { verbindung, anlegen } = attrappe({ trenntBeimLoeschen: false });
    const wege = (await tabellePruefen(verbindung, "t", anlegen)).map((v) => v.weg);
    expect(wege).toContain("eigenes_weg");
  });
});

describe("alsMandant", () => {
  it("klammert jede Aktion in eine Transaktion", async () => {
    // Ohne Transaktion bliebe die Kennung an der Verbindung hängen, und der
    // nächste Abschnitt liefe unbemerkt unter dem falschen Mandanten.
    const gesehen: string[] = [];
    const v: Verbindung = {
      query: vi.fn((sql: string) => {
        gesehen.push(sql.trim().split(" ")[0] ?? "");
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    };
    await alsMandant(v, MANDANT_A, () => Promise.resolve(1));
    expect(gesehen[0]).toBe("begin");
    expect(gesehen.at(-1)).toBe("commit");
  });

  it("macht bei einem Fehler zurück und lässt keine Kennung stehen", async () => {
    const gesehen: string[] = [];
    const v: Verbindung = {
      query: vi.fn((sql: string) => {
        gesehen.push(sql.trim().split(" ")[0] ?? "");
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
    };
    await expect(
      alsMandant(v, MANDANT_B, () => Promise.reject(new Error("kaputt"))),
    ).rejects.toThrow("kaputt");
    expect(gesehen).toContain("rollback");
    expect(gesehen).not.toContain("commit");
  });

  it("setzt die Kennung als lokale Einstellung, nicht als Sitzungswert", async () => {
    let gesehen = "";
    const v: Verbindung = {
      query: (sql: string) => {
        if (sql.includes("set_config")) gesehen = sql;
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    };
    await alsMandant(v, MANDANT_A, () => Promise.resolve(0));
    // Das dritte Argument `true` heisst „nur in dieser Transaktion".
    expect(gesehen).toMatch(/set_config\('request\.jwt\.claims',\s*\$1,\s*true\)/);
  });
});

describe("bericht", () => {
  it("sagt, worauf geprüft wurde — auch wenn nichts gefunden wurde", () => {
    // CLAUDE.md §2.2: erlaubt ist „geprüft auf X, gefunden Y". Ein leerer
    // Bericht ohne das X wäre nicht von einem Lauf zu unterscheiden, bei dem
    // gar nicht geprüft wurde.
    const text = bericht([], ["laeufe", "protokolle"]);
    expect(text).toContain("Geprüft auf");
    expect(text).toContain("laeufe");
    expect(text).toContain("Gefunden: nichts");
  });

  it("behauptet nie, etwas sei sicher", () => {
    const text = bericht([], ["laeufe"]);
    expect(text).not.toMatch(/\b(sicher|unhackbar|garantiert|bulletproof)\b/i);
  });

  it("zählt die Verstöße und nennt Tabelle und Weg", () => {
    const text = bericht(
      [{ tabelle: "befunde", weg: "lesen", beschreibung: "A sieht B" }],
      ["befunde"],
    );
    expect(text).toContain("1");
    expect(text).toContain("befunde");
    expect(text).toContain("lesen");
  });
});
