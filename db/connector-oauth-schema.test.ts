import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sql = readFileSync(fileURLToPath(new URL("./006_connector_oauth.sql", import.meta.url)), "utf8");

describe("Migration 006 Connector OAuth", () => {
  it("erzwingt RLS auf den OAuth-Sitzungen", () => {
    expect(sql).toContain("alter table connector_oauth_sessions enable row level security");
    expect(sql).toContain("alter table connector_oauth_sessions force row level security");
    expect(sql).toContain("nutzer_id = auth.nutzer_kennung()");
  });

  it("gibt byb_connector genau die für RLS nötige Auth-Schema-Berechtigung", () => {
    expect(sql).toContain("grant usage on schema public, auth to byb_connector");
    expect(sql).toContain("grant execute on function auth.nutzer_kennung() to byb_connector");
  });

  it("hält App- und Worker-Rollen von OAuth-Sitzungen fern", () => {
    expect(sql).toContain("revoke all on connector_oauth_sessions from byb_app");
    expect(sql).toContain("revoke all on connector_oauth_sessions from byb_worker");
    expect(sql).toContain(
      "grant select, insert, update, delete on connector_oauth_sessions to byb_connector",
    );
  });

  it("speichert keine Provider-Secrets als Spalten", () => {
    expect(sql).not.toMatch(/\b(access_token|refresh_token|client_secret|api_key|private_key)\b/i);
    expect(sql).toContain("state_hash");
  });
});
