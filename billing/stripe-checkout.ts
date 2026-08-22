import { z } from "zod";

import { BYB_TOPUP, planNachKey, type PlanKey } from "./katalog.js";

const CheckoutAntwort = z.object({
  id: z.string().min(1),
  url: z.string().url(),
});

export interface CheckoutErgebnis {
  readonly id: string;
  readonly url: string;
}

interface CheckoutBasis {
  readonly stripeSecret: string;
  readonly nutzerId: string;
  readonly basisUrl: string;
  readonly fetcher?: typeof fetch;
}

interface AboCheckout extends CheckoutBasis {
  readonly art: "abo";
  readonly planKey: PlanKey;
}

interface TopupCheckout extends CheckoutBasis {
  readonly art: "topup";
}

export type CheckoutAnfrage = AboCheckout | TopupCheckout;

function httpsBasis(wert: string): string {
  const url = new URL(wert);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error("Checkout-Basis-URL muss eine saubere HTTPS-URL sein.");
  }
  return url.origin;
}

export async function checkoutAnlegen(anfrage: CheckoutAnfrage): Promise<CheckoutErgebnis> {
  const geheimnis = anfrage.stripeSecret.trim();
  const nutzerId = anfrage.nutzerId.trim();
  if (geheimnis.length < 20) throw new Error("Stripe-Zugang fehlt.");
  if (nutzerId.length < 1 || nutzerId.length > 300) throw new Error("Ungültige Nutzerkennung.");

  const basis = httpsBasis(anfrage.basisUrl);
  const body = new URLSearchParams();
  body.set("success_url", `${basis}/?checkout=erfolg&session_id={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${basis}/?checkout=abgebrochen`);
  body.set("client_reference_id", nutzerId);
  body.set("line_items[0][quantity]", "1");
  body.set("metadata[nutzer_id]", nutzerId);
  body.set("metadata[application]", "byb");
  body.set("metadata[namespace]", "byb_preview_v1");

  if (anfrage.art === "abo") {
    const plan = planNachKey(anfrage.planKey);
    if (plan === undefined) throw new Error("Unbekannter BYB-Plan.");
    body.set("mode", "subscription");
    body.set("line_items[0][price]", plan.stripePriceId);
    body.set("metadata[plan_key]", plan.key);
    body.set("subscription_data[metadata][application]", "byb");
    body.set("subscription_data[metadata][nutzer_id]", nutzerId);
    body.set("subscription_data[metadata][plan_key]", plan.key);
  } else {
    body.set("mode", "payment");
    body.set("customer_creation", "always");
    body.set("line_items[0][price]", BYB_TOPUP.stripePriceId);
    body.set("metadata[topup_credits]", String(BYB_TOPUP.credits));
    body.set("payment_intent_data[metadata][application]", "byb");
    body.set("payment_intent_data[metadata][nutzer_id]", nutzerId);
    body.set("payment_intent_data[metadata][topup_credits]", String(BYB_TOPUP.credits));
  }

  const antwort = await (anfrage.fetcher ?? fetch)("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${geheimnis}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const daten: unknown = await antwort.json();
  if (!antwort.ok) throw new Error(`Stripe-Checkout fehlgeschlagen (${antwort.status}).`);
  return CheckoutAntwort.parse(daten);
}
