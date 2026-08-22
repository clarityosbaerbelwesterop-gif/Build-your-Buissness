import { z } from "zod";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import { planKeySchema } from "../billing/katalog.js";
import { checkoutAnlegen } from "../billing/stripe-checkout.js";
import { zugang } from "../config/zugaenge.js";

const Anfrage = z.discriminatedUnion("art", [
  z.object({ art: z.literal("abo"), planKey: planKeySchema }),
  z.object({ art: z.literal("topup") }),
]);

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json({ fehler: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const token = bearerTokenAus(request.headers.get("authorization") ?? undefined);
    const identitaet = await neonJwtPruefer(neonJwtKonfigurationAusUmgebung())(token);
    const eingabe = Anfrage.parse(await request.json());
    const basisUrl = new URL(request.url).origin;
    const gemeinsameDaten = {
      stripeSecret: zugang("stripeSecretKey"),
      nutzerId: identitaet.nutzerId,
      basisUrl,
    } as const;
    const ergebnis = eingabe.art === "abo"
      ? await checkoutAnlegen({ ...gemeinsameDaten, art: "abo", planKey: eingabe.planKey })
      : await checkoutAnlegen({ ...gemeinsameDaten, art: "topup" });
    return json({ checkoutUrl: ergebnis.url });
  } catch {
    return json({ fehler: "CHECKOUT_NICHT_VERFUEGBAR" }, 400);
  }
}
