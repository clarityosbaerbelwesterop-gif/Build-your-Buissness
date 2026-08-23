import { describe, expect, it } from "vitest";

import { GET as billingGET } from "./billing.js";
import { POST as checkoutPOST } from "./checkout.js";
import { POST as stripeWebhookPOST } from "./stripe-webhook.js";

describe("Vercel Runtime-Handler", () => {
  it("exportiert die HTTP-Methoden im von Vercel erwarteten Format", () => {
    expect(billingGET).toBeTypeOf("function");
    expect(checkoutPOST).toBeTypeOf("function");
    expect(stripeWebhookPOST).toBeTypeOf("function");
  });
});
