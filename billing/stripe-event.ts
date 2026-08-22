import { z } from "zod";

import { BYB_TOPUP, planKeySchema, planNachStripePreis, type PlanKey } from "./katalog.js";

const Metadata = z.record(z.string(), z.string()).default({});
const Id = z.string().min(1).max(180);

const CheckoutSession = z.object({
  id: Id,
  mode: z.enum(["subscription", "payment"]),
  payment_status: z.string().optional(),
  customer: Id.nullable().optional(),
  subscription: Id.nullable().optional(),
  client_reference_id: z.string().nullable().optional(),
  metadata: Metadata.optional(),
}).passthrough();

const Invoice = z.object({
  id: Id,
  customer: Id,
  subscription: Id.nullable().optional(),
  parent: z.object({
    subscription_details: z.object({ subscription: Id }).optional(),
  }).optional(),
}).passthrough();

const Subscription = z.object({
  id: Id,
  customer: Id,
  status: z.enum(["incomplete", "incomplete_expired", "trialing", "active", "past_due", "canceled", "unpaid", "paused"]),
  current_period_start: z.number().int().nonnegative().optional(),
  current_period_end: z.number().int().nonnegative().optional(),
  metadata: Metadata.optional(),
  items: z.object({
    data: z.array(z.object({
      price: z.object({ id: Id }),
    }).passthrough()).min(1),
  }),
}).passthrough();

const StripeEvent = z.object({
  id: Id,
  type: z.string().min(1).max(180),
  data: z.object({ object: z.unknown() }),
}).passthrough();

export type BillingBefehl =
  | {
      readonly art: "abo_verknuepfen";
      readonly eventId: string;
      readonly objektId: string;
      readonly nutzerId: string;
      readonly customerId: string;
      readonly subscriptionId: string;
      readonly planKey: PlanKey;
    }
  | {
      readonly art: "topup_gutschreiben";
      readonly eventId: string;
      readonly objektId: string;
      readonly nutzerId: string;
      readonly customerId: string;
      readonly credits: number;
    }
  | {
      readonly art: "abo_monat_gutschreiben";
      readonly eventId: string;
      readonly objektId: string;
      readonly customerId: string;
      readonly subscriptionId?: string;
    }
  | {
      readonly art: "abo_status";
      readonly eventId: string;
      readonly objektId: string;
      readonly customerId: string;
      readonly nutzerId?: string;
      readonly subscriptionId: string;
      readonly planKey: PlanKey;
      readonly status: "trialing" | "active" | "past_due" | "unpaid" | "canceled" | "paused" | "inaktiv";
      readonly periodeStart?: number;
      readonly periodeEnde?: number;
    }
  | {
      readonly art: "ignorieren";
      readonly eventId: string;
      readonly objektId?: string;
      readonly eventTyp: string;
    };

function bybNutzer(metadata: Record<string, string> | undefined, clientReference?: string | null): string {
  if (metadata?.application !== "byb") throw new Error("Stripe-Objekt gehört nicht zu BYB.");
  const wert = metadata.nutzer_id ?? clientReference;
  if (wert === undefined || wert === null || wert.length < 1 || wert.length > 300) {
    throw new Error("BYB-Nutzerzuordnung fehlt im Stripe-Objekt.");
  }
  return wert;
}

function aboStatus(status: z.infer<typeof Subscription>["status"]): BillingBefehl & { art: "abo_status" }["status"] {
  if (status === "incomplete" || status === "incomplete_expired") return "inaktiv";
  return status;
}

export function stripeEventNormalisieren(eingabe: unknown): BillingBefehl {
  const event = StripeEvent.parse(eingabe);

  if (event.type === "checkout.session.completed") {
    const session = CheckoutSession.parse(event.data.object);
    const metadata = session.metadata ?? {};
    const nutzerId = bybNutzer(metadata, session.client_reference_id);
    const customerId = session.customer;
    if (customerId === undefined || customerId === null) throw new Error("Stripe-Customer fehlt.");

    if (session.mode === "subscription") {
      const subscriptionId = session.subscription;
      if (subscriptionId === undefined || subscriptionId === null) throw new Error("Stripe-Subscription fehlt.");
      const planKey = planKeySchema.parse(metadata.plan_key);
      return { art: "abo_verknuepfen", eventId: event.id, objektId: session.id, nutzerId, customerId, subscriptionId, planKey };
    }

    if (session.payment_status !== "paid") {
      return { art: "ignorieren", eventId: event.id, objektId: session.id, eventTyp: event.type };
    }
    if (metadata.topup_credits !== String(BYB_TOPUP.credits)) throw new Error("Unbekanntes BYB-Top-up.");
    return { art: "topup_gutschreiben", eventId: event.id, objektId: session.id, nutzerId, customerId, credits: BYB_TOPUP.credits };
  }

  if (event.type === "invoice.paid") {
    const invoice = Invoice.parse(event.data.object);
    const subscriptionId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? undefined;
    return { art: "abo_monat_gutschreiben", eventId: event.id, objektId: invoice.id, customerId: invoice.customer, subscriptionId };
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const abo = Subscription.parse(event.data.object);
    const plan = planNachStripePreis(abo.items.data[0]?.price.id ?? "");
    if (plan === undefined) {
      return { art: "ignorieren", eventId: event.id, objektId: abo.id, eventTyp: event.type };
    }
    const metadata = abo.metadata ?? {};
    const nutzerId = metadata.application === "byb" ? metadata.nutzer_id : undefined;
    return {
      art: "abo_status",
      eventId: event.id,
      objektId: abo.id,
      customerId: abo.customer,
      nutzerId,
      subscriptionId: abo.id,
      planKey: plan.key,
      status: event.type === "customer.subscription.deleted" ? "canceled" : aboStatus(abo.status),
      periodeStart: abo.current_period_start,
      periodeEnde: abo.current_period_end,
    };
  }

  return { art: "ignorieren", eventId: event.id, eventTyp: event.type };
}
