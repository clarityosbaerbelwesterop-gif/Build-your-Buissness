import { describe, expect, it } from "vitest";

import { GET as auftraegeGET, POST as auftraegePOST } from "./auftraege.js";
import { GET as authGET, POST as authPOST } from "./auth.js";
import { GET as billingGET } from "./billing.js";
import { POST as checkoutPOST } from "./checkout.js";
import { GET as connectorsGET } from "./connectors.js";
import { POST as stripeWebhookPOST } from "./stripe-webhook.js";
import { GET as surfaceGET, POST as surfacePOST } from "./surface.js";
import { POST as surfaceLeadsPOST } from "./surface-leads.js";

describe("Vercel Runtime-Handler", () => {
  it("exportiert die HTTP-Methoden im von Vercel erwarteten Format", () => {
    expect(auftraegeGET).toBeTypeOf("function");
    expect(auftraegePOST).toBeTypeOf("function");
    expect(authGET).toBeTypeOf("function");
    expect(authPOST).toBeTypeOf("function");
    expect(billingGET).toBeTypeOf("function");
    expect(checkoutPOST).toBeTypeOf("function");
    expect(connectorsGET).toBeTypeOf("function");
    expect(stripeWebhookPOST).toBeTypeOf("function");
    expect(surfaceGET).toBeTypeOf("function");
    expect(surfacePOST).toBeTypeOf("function");
    expect(surfaceLeadsPOST).toBeTypeOf("function");
  });
});
