/**
 * Die Zugänge zu den Diensten — eine Stelle, an der sie gelesen werden.
 *
 * CLAUDE.md §2.4: Keys kommen aus GitHub Secrets (CI) bzw. den
 * Vercel-Umgebungsvariablen (Laufzeit). Ein Key im Diff ist ein Abbruchgrund.
 */

export interface Zugang {
  readonly name: string;
  readonly wofuer: string;
  readonly abStufe: "M0" | "M1" | "später";
}

export const ZUGAENGE = {
  nvApiKey1: {
    name: "NV_API_KEY_1",
    wofuer: "Zugang zu nemotron-3-ultra-550b-a55b",
    abStufe: "M1",
  },
  nvApiKey2: {
    name: "NV_API_KEY_2",
    wofuer: "Zugang zu laguna-xs-2.1",
    abStufe: "M1",
  },
  nvApiKey3: {
    name: "NV_API_KEY_3",
    wofuer: "Zugang zu step-3.7-flash",
    abStufe: "M1",
  },
  nvidiaBaseUrl: {
    name: "NVIDIA_BASE_URL",
    wofuer: "Endpunkt der Modelle",
    abStufe: "M1",
  },
  neonApiKey: {
    name: "NEON_API_KEY",
    wofuer: "Datenbank je Lauf anlegen (Branching)",
    abStufe: "M1",
  },
  datenbankUrl: {
    name: "DATABASE_URL",
    wofuer: "Verbindung zur Datenbank des Backends",
    abStufe: "M1",
  },
  stripeSecretKey: {
    name: "STRIPE_SECRET_KEY",
    wofuer: "BYB Checkout Sessions serverseitig anlegen",
    abStufe: "M1",
  },
  stripeWebhookSecret: {
    name: "STRIPE_WEBHOOK_SECRET",
    wofuer: "Signatur eingehender Stripe-Webhooks prüfen",
    abStufe: "M1",
  },
  vercelToken: {
    name: "VERCEL_TOKEN",
    wofuer: "BYB Preview deployen und Runtime-Secrets synchronisieren",
    abStufe: "M1",
  },
} as const satisfies Record<string, Zugang>;

export type ZugangsName = keyof typeof ZUGAENGE;

const VORGABEN: Partial<Record<ZugangsName, string>> = {
  nvidiaBaseUrl: "https://integrate.api.nvidia.com/v1",
};

export class ZugangFehlt extends Error {
  readonly zugang: Zugang;

  constructor(zugang: Zugang) {
    super(
      `${zugang.name} ist nicht gesetzt (${zugang.wofuer}). `
      + `Der Wert gehört in die GitHub Secrets des Repositorys, nicht in den `
      + `Quelltext.`,
    );
    this.name = "ZugangFehlt";
    this.zugang = zugang;
  }
}

export function zugang(
  name: ZugangsName,
  umgebung: Record<string, string | undefined> = process.env,
): string {
  const eintrag: Zugang = ZUGAENGE[name];
  const wert = umgebung[eintrag.name]?.trim();
  if (wert !== undefined && wert.length > 0) return wert;
  const vorgabe = VORGABEN[name];
  if (vorgabe !== undefined) return vorgabe;
  throw new ZugangFehlt(eintrag);
}

export function zugangVorhanden(
  name: ZugangsName,
  umgebung: Record<string, string | undefined> = process.env,
): boolean {
  const wert = umgebung[ZUGAENGE[name].name]?.trim();
  return wert !== undefined && wert.length > 0;
}

export function zugangsUebersicht(
  umgebung: Record<string, string | undefined> = process.env,
): { readonly name: string; readonly gesetzt: boolean; readonly abStufe: string }[] {
  return (Object.keys(ZUGAENGE) as ZugangsName[]).map((schluessel) => ({
    name: ZUGAENGE[schluessel].name,
    gesetzt: zugangVorhanden(schluessel, umgebung),
    abStufe: ZUGAENGE[schluessel].abStufe,
  }));
}
