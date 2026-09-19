import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sql = readFileSync(fileURLToPath(new URL("./006_surface.sql", import.meta.url)), "utf8");

describe("Migration 006 Surface", () => {
  it("legt nur die Anfragen-Tabelle an und erzwingt RLS", () => {
    expect(sql).toContain("create table if not exists surface_leads");
    expect(sql).toContain("alter table surface_leads enable row level security");
    expect(sql).toContain("alter table surface_leads force row level security");
    expect(sql).toContain("nutzer_id = auth.nutzer_kennung()");
    expect(sql).toContain("with check (nutzer_id = auth.nutzer_kennung())");
  });

  it("hängt Anfragen an bestehende BYB-Aufträge und mischt keine fremden Schemas", () => {
    expect(sql).toContain("references steuer_auftraege (id)");
    expect(sql).not.toMatch(/zeus|marketplace|studio|scp/i);
    expect(sql).not.toMatch(/grant[\s\S]*?to byb_worker/i);
    expect(sql).toContain("grant select, insert on surface_leads to byb_app");
  });

  it("läuft als eine Einheit und ist wiederholbar", () => {
    const ohneKommentare = sql.split("\n")
      .filter((zeile) => !zeile.trimStart().startsWith("--") && zeile.trim().length > 0)
      .join("\n")
      .toLowerCase();
    expect(ohneKommentare.startsWith("begin;")).toBe(true);
    expect(ohneKommentare.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql.match(/create table if not exists/gi)).toHaveLength(1);
  });
});
