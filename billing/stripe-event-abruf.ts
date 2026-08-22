import { z } from "zod";

const EventId = z.string().regex(/^evt_[A-Za-z0-9_]+$/).max(180);
const StripeEvent = z.object({ id: EventId, livemode: z.boolean() }).passthrough();

export function stripeEventIdAusPayload(payload: string): string {
  const daten: unknown = JSON.parse(payload);
  return EventId.parse(z.object({ id: z.unknown() }).parse(daten).id);
}

export async function stripeEventKanonischAbrufen(
  eventIdEingabe: string,
  stripeSecret: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const eventId = EventId.parse(eventIdEingabe);
  const secret = stripeSecret.trim();
  if (secret.length < 20) throw new Error("Stripe-Zugang fehlt.");

  const antwort = await fetcher(`https://api.stripe.com/v1/events/${encodeURIComponent(eventId)}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const daten: unknown = await antwort.json();
  if (!antwort.ok) throw new Error(`Stripe-Event-Abruf fehlgeschlagen (${antwort.status}).`);
  const event = StripeEvent.parse(daten);
  if (event.id !== eventId || !event.livemode) throw new Error("Stripe-Event passt nicht zur BYB-Live-Umgebung.");
  return daten;
}
