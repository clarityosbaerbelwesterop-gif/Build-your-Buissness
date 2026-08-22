import { describe, expect, it, vi } from "vitest";

import { BYB_PLAENE, BYB_TOPUP } from "./katalog.js";
import { checkoutAnlegen } from "./stripe-checkout.js";

function antwort(): Response {
  return new Response(JSON.stringify({ id: "cs_test", url: "https://checkout.stripe.com/c/pay/test" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("BYB Stripe Checkout", () => {
  it("verwendet beim Starter nur die fest verdrahtete BYB-Price-ID und Nutzer-Metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(antwort());
    await checkoutAnlegen({
      art: "abo",
      planKey: "starter",
      stripeSecret: "sk_live_testwert_nur_fuer_unit_test_123",
      nutzerId: "user-1",
      basisUrl: "https://preview.example.com/pfad",
      fetcher,
    });

    const aufruf = fetcher.mock.calls[0];
    expect(aufruf?.[0]).toBe("https://api.stripe.com/v1/checkout/sessions");
    const init = aufruf?.[1];
    const body = init?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    const parameter = body as URLSearchParams;
    expect(parameter.get("line_items[0][price]")).toBe(BYB_PLAENE[0].stripePriceId);
    expect(parameter.get("metadata[application]")).toBe("byb");
    expect(parameter.get("metadata[nutzer_id]")).toBe("user-1");
    expect(parameter.get("success_url")).toBe("https://preview.example.com/?checkout=erfolg&session_id={CHECKOUT_SESSION_ID}");
  });

  it("erzwingt für Top-ups einen Stripe-Customer und exakt den BYB-Top-up-Preis", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(antwort());
    await checkoutAnlegen({
      art: "topup",
      stripeSecret: "sk_live_testwert_nur_fuer_unit_test_123",
      nutzerId: "user-2",
      basisUrl: "https://preview.example.com",
      fetcher,
    });
    const parameter = fetcher.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(parameter.get("customer_creation")).toBe("always");
    expect(parameter.get("line_items[0][price]")).toBe(BYB_TOPUP.stripePriceId);
    expect(parameter.get("metadata[topup_credits]")).toBe("100");
  });

  it("sendet den Stripe-Key nur als Authorization-Header und nie als URL/Body", async () => {
    const secret = "sk_live_testwert_nur_fuer_unit_test_123";
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(antwort());
    await checkoutAnlegen({ art: "abo", planKey: "pro", stripeSecret: secret, nutzerId: "u", basisUrl: "https://preview.example.com", fetcher });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).not.toContain(secret);
    expect(String(init?.body)).not.toContain(secret);
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${secret}`);
  });
});
