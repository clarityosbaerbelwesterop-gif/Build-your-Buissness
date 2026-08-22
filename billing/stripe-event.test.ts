import { describe, expect, it } from "vitest";

import { BYB_PLAENE } from "./katalog.js";
import { stripeEventNormalisieren } from "./stripe-event.js";

const starter = BYB_PLAENE[0];

function event(type: string, object: unknown, id = "evt_byb_1"): unknown {
  return { id, type, data: { object } };
}

describe("Stripe Event-Normalisierung", () => {
  it("ordnet ein BYB-Abo ausschließlich über BYB-Metadata zu", () => {
    expect(stripeEventNormalisieren(event("checkout.session.completed", {
      id: "cs_byb",
      mode: "subscription",
      customer: "cus_byb",
      subscription: "sub_byb",
      client_reference_id: "user-1",
      metadata: {
        application: "byb",
        namespace: "byb_preview_v1",
        nutzer_id: "user-1",
        plan_key: "starter",
      },
    }))).toMatchObject({
      art: "abo_verknuepfen",
      nutzerId: "user-1",
      planKey: "starter",
    });
  });

  it("ignoriert Checkout-Events alter Produkte im selben Stripe-Account", () => {
    expect(stripeEventNormalisieren(event("checkout.session.completed", {
      id: "cs_alt",
      mode: "subscription",
      customer: "cus_alt",
      subscription: "sub_alt",
      metadata: { application: "owedops" },
    }))).toMatchObject({ art: "ignorieren" });
  });

  it("erkennt bezahlte BYB-Rechnung an der BYB-Price-ID", () => {
    expect(stripeEventNormalisieren(event("invoice.paid", {
      id: "in_byb",
      customer: "cus_byb",
      subscription: "sub_byb",
      lines: { data: [{ price: { id: starter.stripePriceId } }] },
    }))).toMatchObject({ art: "abo_monat_gutschreiben", customerId: "cus_byb" });
  });

  it("ignoriert bezahlte Rechnungen fremder Stripe-Produkte", () => {
    expect(stripeEventNormalisieren(event("invoice.paid", {
      id: "in_alt",
      customer: "cus_alt",
      subscription: "sub_alt",
      lines: { data: [{ price: { id: "price_scp_legacy" } }] },
    }))).toMatchObject({ art: "ignorieren" });
  });

  it("schreibt nur das definierte 100-Credit-Top-up gut", () => {
    expect(stripeEventNormalisieren(event("checkout.session.completed", {
      id: "cs_topup",
      mode: "payment",
      payment_status: "paid",
      customer: "cus_byb",
      client_reference_id: "user-1",
      metadata: {
        application: "byb",
        namespace: "byb_preview_v1",
        nutzer_id: "user-1",
        topup_credits: "100",
      },
    }))).toMatchObject({ art: "topup_gutschreiben", credits: 100 });
  });
});
