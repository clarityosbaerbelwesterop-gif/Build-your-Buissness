import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sql = readFileSync(fileURLToPath(new URL("./005_billing_credits.sql", import.meta.url)), "utf8");

const tabellen = [
  "billing_konten",
  "billing_abos",
  "credit_konten",
  "credit_buchungen",
  "stripe_webhook_ereignisse",
] as const;

describe("Migration 005 Billing/Credits", () => {
  it("erzwingt RLS auf allen Billing-Tabellen", () => {
    for (const tabelle of tabellen) {
      expect(sql).toContain(`alter table ${tabelle} enable row level security`);
      expect(sql).toContain(`alter table ${tabelle} force row level security`);
    }
  });

  it("legt byb_billing ohne Login und ohne RLS-Bypass an", () => {
    expect(sql).toContain("create role byb_billing");
    expect(sql).toContain("nologin");
    expect(sql).toContain("nobypassrls");
  });

  it("gibt dem Nutzerpfad nur Leserechte auf Billing", () => {
    expect(sql).toContain("grant select on billing_konten, billing_abos, credit_konten, credit_buchungen to byb_app");
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete)[^;]*to byb_app/i);
  });

  it("gibt dem Worker nur Billing-Leserechte", () => {
    expect(sql).toContain("grant select on billing_abos, credit_konten to byb_worker");
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete)[^;]*to byb_worker/i);
  });

  it("speichert keine Stripe-Secrets oder rohen Webhook-Payloads", () => {
    expect(sql).not.toMatch(/secret|api_key|refresh_token|access_token|payload\s+jsonb/i);
    expect(sql).toContain("stripe_event_id text primary key");
    expect(sql).toContain("stripe_event_id  text unique");
  });
});
