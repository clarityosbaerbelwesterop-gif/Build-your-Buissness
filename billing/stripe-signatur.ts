import { createHmac, timingSafeEqual } from "node:crypto";

export class StripeSignaturFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignaturFehler";
  }
}

interface SignaturTeile {
  readonly zeit: number;
  readonly signaturen: readonly string[];
}

function signaturLesen(header: string): SignaturTeile {
  let zeit: number | undefined;
  const signaturen: string[] = [];

  for (const teil of header.split(",")) {
    const [schluessel, wert] = teil.trim().split("=", 2);
    if (schluessel === "t" && wert !== undefined) {
      const gelesen = Number.parseInt(wert, 10);
      if (Number.isSafeInteger(gelesen)) zeit = gelesen;
    }
    if (schluessel === "v1" && wert !== undefined && /^[0-9a-f]{64}$/i.test(wert)) {
      signaturen.push(wert.toLowerCase());
    }
  }

  if (zeit === undefined || signaturen.length === 0) {
    throw new StripeSignaturFehler("Stripe-Signaturheader ist unvollständig.");
  }

  return { zeit, signaturen };
}

function gleichSicher(a: string, b: string): boolean {
  const links = Buffer.from(a, "hex");
  const rechts = Buffer.from(b, "hex");
  return links.length === rechts.length && timingSafeEqual(links, rechts);
}

export function stripeWebhookSignaturPruefen(
  payload: string,
  header: string,
  secret: string,
  jetztSekunden = Math.floor(Date.now() / 1_000),
  toleranzSekunden = 300,
): void {
  if (secret.trim().length === 0) {
    throw new StripeSignaturFehler("Stripe-Webhook-Secret fehlt.");
  }
  const teile = signaturLesen(header);
  if (Math.abs(jetztSekunden - teile.zeit) > toleranzSekunden) {
    throw new StripeSignaturFehler("Stripe-Webhook-Signatur ist außerhalb des Zeitfensters.");
  }

  const erwartet = createHmac("sha256", secret)
    .update(`${teile.zeit}.${payload}`, "utf8")
    .digest("hex");

  if (!teile.signaturen.some((signatur) => gleichSicher(signatur, erwartet))) {
    throw new StripeSignaturFehler("Stripe-Webhook-Signatur ist ungültig.");
  }
}
