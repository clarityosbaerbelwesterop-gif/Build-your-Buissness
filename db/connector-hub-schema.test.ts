import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sql = readFileSync(fileURLToPath(new URL("./004_connector_hub.sql", import.meta.url)), "utf8");

describe("Migration 004 Connector Hub", () => {
  it("erzwingt RLS auf beiden Connector-Tabellen", () => {
    expect(sql).toContain("alter table connector_verbindungen enable row level security");
    expect(sql).toContain("alter table connector_verbindungen force row level security");
    expect(sql).toContain("alter table connector_projekt_werkzeuge enable row level security");
    expect(sql).toContain("alter table connector_projekt_werkzeuge force row level security");
  });

  it("bindet den Nutzerpfad an auth.nutzer_kennung", () => {
    expect(sql.match(/nutzer_id = auth\.nutzer_kennung\(\)/g)).toHaveLength(4);
  });

  it("gibt byb_worker ausschließlich Leserechte auf Connector-Daten", () => {
    expect(sql).toContain("for select to byb_worker");
    expect(sql).toContain("grant select on connector_verbindungen, connector_projekt_werkzeuge to byb_worker");
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete)[^;]*to byb_worker/i);
  });

  it("setzt Migration 002 und 003 als Voraussetzung", () => {
    expect(sql).toContain("Migration 002 mit Rolle byb_app");
    expect(sql).toContain("Migration 003 mit Rolle byb_worker");
  });
});
