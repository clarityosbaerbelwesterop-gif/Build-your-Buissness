import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  fileURLToPath(new URL("./003_control_plane.sql", import.meta.url)),
  "utf8",
).toLowerCase();

describe("Migration 003", () => {
  it("legt kanonische Aufträge, Aktionsprojektion und Activity-Log an", () => {
    expect(sql).toContain("create table if not exists steuer_auftraege");
    expect(sql).toContain("create table if not exists steuer_aktionen");
    expect(sql).toContain("create table if not exists steuer_ereignisse");
    expect(sql).toContain("inhalt             jsonb not null");
    expect(sql).toContain("lease_token");
    expect(sql).toContain("lease_bis");
  });

  it("erzwingt RLS auf allen drei Control-Plane-Tabellen", () => {
    for (const tabelle of ["steuer_auftraege", "steuer_aktionen", "steuer_ereignisse"]) {
      expect(sql).toContain(`alter table ${tabelle} enable row level security`);
      expect(sql).toContain(`alter table ${tabelle} force row level security`);
    }
  });

  it("hält die Worker-Rolle ohne Login und ohne RLS-Bypass", () => {
    expect(sql).toMatch(/create role byb_worker[\s\S]*?nologin/);
    expect(sql).toMatch(/create role byb_worker[\s\S]*?nobypassrls/);
    expect(sql).not.toMatch(/create role byb_worker[\s\S]*?bypassrls;/);
  });

  it("gibt dem Worker keine Rechte auf bestehende Nutzerdatentabellen", () => {
    expect(sql).not.toMatch(/grant[\s\S]*?\bon\s+(laeufe|protokolle|befunde|runden)\b[\s\S]*?to byb_worker/);
    expect(sql).toContain("grant select, update on steuer_auftraege to byb_worker");
    expect(sql).toContain("grant select, insert, update on steuer_aktionen to byb_worker");
    expect(sql).toContain("grant select, insert on steuer_ereignisse to byb_worker");
  });

  it("beschränkt Nutzerzeilen über auth.nutzer_kennung", () => {
    expect(sql.match(/nutzer_id = auth\.nutzer_kennung\(\)/g)?.length).toBe(6);
  });
});
