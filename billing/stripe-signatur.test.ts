import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StripeSignaturFehler, stripeWebhookSignaturPruefen } from "./stripe-signatur.js";

function header(payload: string, secret: string, zeit: number): string {
  const signatur = createHmac("sha256", secret).update(`${zeit}.${payload}`).digest("hex");
  return `t=${zeit},v1=${signatur}`;
}

describe("Stripe Webhook Signatur", () => {
  it("akzeptiert eine gültige v1-Signatur im Zeitfenster", () => {
    const payload = '{"id":"evt_byb"}';
    expect(() => stripeWebhookSignaturPruefen(payload, header(payload, "whsec_test_geheimnis_123456789", 1_000), "whsec_test_geheimnis_123456789", 1_050)).not.toThrow();
  });

  it("lehnt manipulierten Payload ab", () => {
    const secret = "whsec_test_geheimnis_123456789";
    expect(() => stripeWebhookSignaturPruefen("manipuliert", header("original", secret, 1_000), secret, 1_001)).toThrow(StripeSignaturFehler);
  });

  it("lehnt alte Signaturen ab", () => {
    const payload = "{}";
    const secret = "whsec_test_geheimnis_123456789";
    expect(() => stripeWebhookSignaturPruefen(payload, header(payload, secret, 1_000), secret, 1_301, 300)).toThrow(/Zeitfenster/);
  });

  it("gibt das Secret niemals in Fehlertexten aus", () => {
    const secret = "whsec_super_geheim_niemals_loggen";
    try {
      stripeWebhookSignaturPruefen("{}", "t=1,v1=" + "0".repeat(64), secret, 1);
    } catch (fehler) {
      expect(String(fehler)).not.toContain(secret);
    }
  });
});
