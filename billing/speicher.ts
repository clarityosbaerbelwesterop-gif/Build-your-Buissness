import { z } from "zod";

import type { SqlVerbindung } from "../db/auth-kontext.js";
import { mitBillingTransaktion } from "../db/billing-kontext.js";
import { planNachKey } from "./katalog.js";
import type { BillingBefehl } from "./stripe-event.js";

const NutzerZeile = z.object({ nutzer_id: z.string().min(1) });
const AboZeile = z.object({ nutzer_id: z.string().min(1), monatliche_credits: z.number().int().positive() });

export interface BillingVerarbeitung {
  readonly duplikat: boolean;
  readonly zustand: "verarbeitet" | "ignoriert";
}

async function eventReservieren(verbindung: SqlVerbindung, befehl: BillingBefehl): Promise<boolean> {
  const ergebnis = await verbindung.query(
    `insert into stripe_webhook_ereignisse
       (stripe_event_id, typ, objekt_id, zustand)
     values ($1, $2, $3, 'empfangen')
     on conflict (stripe_event_id) do nothing
     returning stripe_event_id`,
    [befehl.eventId, befehl.art, befehl.objektId ?? null],
  );
  return ergebnis.rows.length === 1;
}

async function eventAbschliessen(
  verbindung: SqlVerbindung,
  eventId: string,
  zustand: "verarbeitet" | "ignoriert",
): Promise<void> {
  await verbindung.query(
    `update stripe_webhook_ereignisse
        set zustand = $2, verarbeitet = now(), fehler_code = null
      where stripe_event_id = $1`,
    [eventId, zustand],
  );
}

async function kontoSicherstellen(
  verbindung: SqlVerbindung,
  nutzerId: string,
  customerId: string,
): Promise<void> {
  await verbindung.query(
    `insert into billing_konten (nutzer_id, stripe_customer_id)
     values ($1, $2)
     on conflict (nutzer_id) do update
       set stripe_customer_id = excluded.stripe_customer_id,
           aktualisiert = now()
     where billing_konten.stripe_customer_id is null
        or billing_konten.stripe_customer_id = excluded.stripe_customer_id`,
    [nutzerId, customerId],
  );
  const pruefung = await verbindung.query(
    `select nutzer_id from billing_konten
      where nutzer_id = $1 and stripe_customer_id = $2`,
    [nutzerId, customerId],
  );
  if (pruefung.rows.length !== 1) throw new Error("Stripe-Customer kollidiert mit bestehender BYB-Zuordnung.");
  await verbindung.query(
    `insert into credit_konten (nutzer_id) values ($1)
     on conflict (nutzer_id) do nothing`,
    [nutzerId],
  );
}

async function nutzerNachCustomer(verbindung: SqlVerbindung, customerId: string): Promise<string> {
  const ergebnis = await verbindung.query(
    `select nutzer_id from billing_konten where stripe_customer_id = $1`,
    [customerId],
  );
  const zeile = NutzerZeile.safeParse(ergebnis.rows[0]);
  if (!zeile.success) throw new Error("Stripe-Customer ist noch keinem BYB-Nutzer zugeordnet.");
  return zeile.data.nutzer_id;
}

async function creditsGutschreiben(
  verbindung: SqlVerbindung,
  eventId: string,
  nutzerId: string,
  credits: number,
  grund: "abo_monat" | "topup",
  referenz: string,
): Promise<void> {
  const buchung = await verbindung.query(
    `insert into credit_buchungen
       (id, nutzer_id, credits_delta, grund, stripe_event_id, referenz)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (stripe_event_id) do nothing
     returning id`,
    [`stripe:${eventId}`, nutzerId, credits, grund, eventId, referenz],
  );
  if (buchung.rows.length === 0) return;
  await verbindung.query(
    `update credit_konten
        set saldo = saldo + $2,
            revision = revision + 1,
            aktualisiert = now()
      where nutzer_id = $1`,
    [nutzerId, credits],
  );
}

async function verarbeiten(verbindung: SqlVerbindung, befehl: BillingBefehl): Promise<"verarbeitet" | "ignoriert"> {
  if (befehl.art === "ignorieren") return "ignoriert";

  if (befehl.art === "abo_verknuepfen") {
    const plan = planNachKey(befehl.planKey);
    if (plan === undefined) throw new Error("Unbekannter BYB-Plan.");
    await kontoSicherstellen(verbindung, befehl.nutzerId, befehl.customerId);
    await verbindung.query(
      `insert into billing_abos
         (nutzer_id, stripe_subscription_id, plan_key, monatliche_credits, status)
       values ($1, $2, $3, $4, 'inaktiv')
       on conflict (nutzer_id) do update
         set stripe_subscription_id = excluded.stripe_subscription_id,
             plan_key = excluded.plan_key,
             monatliche_credits = excluded.monatliche_credits,
             aktualisiert = now()`,
      [befehl.nutzerId, befehl.subscriptionId, plan.key, plan.monatlicheCredits],
    );
    return "verarbeitet";
  }

  if (befehl.art === "topup_gutschreiben") {
    await kontoSicherstellen(verbindung, befehl.nutzerId, befehl.customerId);
    await creditsGutschreiben(verbindung, befehl.eventId, befehl.nutzerId, befehl.credits, "topup", befehl.objektId);
    return "verarbeitet";
  }

  if (befehl.art === "abo_monat_gutschreiben") {
    const nutzerId = await nutzerNachCustomer(verbindung, befehl.customerId);
    const ergebnis = await verbindung.query(
      `select nutzer_id, monatliche_credits
         from billing_abos
        where nutzer_id = $1
          and ($2::text is null or stripe_subscription_id = $2)`,
      [nutzerId, befehl.subscriptionId ?? null],
    );
    const abo = AboZeile.safeParse(ergebnis.rows[0]);
    if (!abo.success) throw new Error("BYB-Abo ist für die bezahlte Rechnung noch nicht zugeordnet.");
    await creditsGutschreiben(
      verbindung,
      befehl.eventId,
      abo.data.nutzer_id,
      abo.data.monatliche_credits,
      "abo_monat",
      befehl.objektId,
    );
    return "verarbeitet";
  }

  const plan = planNachKey(befehl.planKey);
  if (plan === undefined) throw new Error("Unbekannter BYB-Plan.");
  const nutzerId = befehl.nutzerId ?? await nutzerNachCustomer(verbindung, befehl.customerId);
  await kontoSicherstellen(verbindung, nutzerId, befehl.customerId);
  await verbindung.query(
    `insert into billing_abos
       (nutzer_id, stripe_subscription_id, stripe_price_id, plan_key,
        monatliche_credits, status, periode_start, periode_ende)
     values ($1, $2, $3, $4, $5, $6,
             case when $7::bigint is null then null else to_timestamp($7) end,
             case when $8::bigint is null then null else to_timestamp($8) end)
     on conflict (nutzer_id) do update
       set stripe_subscription_id = excluded.stripe_subscription_id,
           stripe_price_id = excluded.stripe_price_id,
           plan_key = excluded.plan_key,
           monatliche_credits = excluded.monatliche_credits,
           status = excluded.status,
           periode_start = excluded.periode_start,
           periode_ende = excluded.periode_ende,
           aktualisiert = now()`,
    [
      nutzerId,
      befehl.subscriptionId,
      plan.stripePriceId,
      plan.key,
      plan.monatlicheCredits,
      befehl.status,
      befehl.periodeStart ?? null,
      befehl.periodeEnde ?? null,
    ],
  );
  return "verarbeitet";
}

export async function billingBefehlSpeichern(
  verbindung: SqlVerbindung,
  befehl: BillingBefehl,
): Promise<BillingVerarbeitung> {
  return mitBillingTransaktion(verbindung, async (tx) => {
    const neu = await eventReservieren(tx, befehl);
    if (!neu) return { duplikat: true, zustand: "verarbeitet" };
    const zustand = await verarbeiten(tx, befehl);
    await eventAbschliessen(tx, befehl.eventId, zustand);
    return { duplikat: false, zustand };
  });
}
