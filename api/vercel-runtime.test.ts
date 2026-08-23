import { describe, expect, it } from "vitest";

import { GET as authGET, POST as authPOST } from "./auth.js";
import { GET as billingGET } from "./billing.js";
import { POST as checkoutPOST } from "./checkout.js";
import { POST as stripeWebhookPOST } from "./stripe-webhook.js";

describe("Vercel Runtime-Handler", () => {
  it("exportiert die HTTP-Methoden im von Vercel erwarteten Format", () => {
    expect(authGET).toBeTypeOf("function");
    expect(authPOST).toBeTypeOf("function");
    expect(billingGET).toBeTypeOf("function");
    expect(checkoutPOST).toBeTypeOf("function");
    expect(stripeWebhookPOST).toBeTypeOf("function");
  });
});
