import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { ConnectorVerbindung } from "../connector-hub/v1.js";
import { fragen, type Antwort } from "../models/nvidia.js";
import {
  Aktionstyp as AktionstypSchema,
  Auftrag,
  type Aktion,
  type Aktionstyp,
  type Auftrag as AuftragTyp,
  type Freigabe,
} from "./v1.js";

const PlanAktion = z
  .object({
    typ: AktionstypSchema,
    titel: z.string().trim().min(3).max(160),
    beschreibung: z.string().trim().min(3).max(600),
    abhaengigkeiten: z.array(z.number().int().min(0)).max(30),
  })
  .strict();

const PlanAntwort = z
  .object({
    aktionen: z.array(PlanAktion).min(1).max(30),
  })
  .strict()
  .superRefine((plan, kontext) => {
    plan.aktionen.forEach((aktion, index) => {
      const gesehen = new Set<number>();
      for (const abhaengigkeit of aktion.abhaengigkeiten) {
        if (abhaengigkeit >= index) {
          kontext.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["aktionen", index, "abhaengigkeiten"],
            message: "Abhängigkeiten dürfen nur auf frühere Aktionen zeigen.",
          });
        }
        if (gesehen.has(abhaengigkeit)) {
          kontext.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["aktionen", index, "abhaengigkeiten"],
            message: "Abhängigkeiten dürfen nicht doppelt vorkommen.",
          });
        }
        gesehen.add(abhaengigkeit);
      }
    });
  });

type FragenFunktion = (
  rolle: "schnell",
  auftrag: { readonly system?: string; readonly prompt: string },
) => Promise<Antwort>;

export interface PlanerOptionen {
  readonly fragenImpl?: FragenFunktion;
  readonly jetzt?: () => number;
  readonly idErzeugen?: () => string;
}

const CREDIT_SCHAETZUNG: Readonly<Record<Aktionstyp, number>> = {
  planen: 4,
  repo: 8,
  code: 40,
  backend: 24,
  auth: 18,
  payments: 18,
  test: 16,
  sandbox: 20,
  security: 24,
  fix: 28,
  deploy: 12,
  domain: 8,
  indexierung: 8,
  werbemittel: 30,
  ads: 20,
  monitoring: 10,
};

function freigabeFuer(typ: Aktionstyp): Freigabe {
  if (typ === "ads") return { klasse: "finanziell", status: "offen" };
  if (["payments", "deploy", "domain", "indexierung"].includes(typ)) {
    return { klasse: "extern", status: "offen" };
  }
  return { klasse: "intern", status: "nicht_erforderlich" };
}

function idsFuerAnbieter(
  verbindungen: readonly ConnectorVerbindung[],
  anbieter: readonly ConnectorVerbindung["anbieter"][],
): string[] {
  return verbindungen
    .filter((verbindung) => verbindung.status === "verbunden" && anbieter.includes(verbindung.anbieter))
    .map((verbindung) => verbindung.id);
}

export function verbindungenFuerAktion(
  typ: Aktionstyp,
  verbindungen: readonly ConnectorVerbindung[],
): string[] {
  switch (typ) {
    case "repo":
    case "code":
    case "test":
    case "security":
    case "fix":
      return idsFuerAnbieter(verbindungen, ["github"]);
    case "backend":
    case "auth": {
      const neon = idsFuerAnbieter(verbindungen, ["neon"]);
      return neon.length > 0 ? neon : idsFuerAnbieter(verbindungen, ["supabase"]);
    }
    case "payments":
      return idsFuerAnbieter(verbindungen, ["stripe"]);
    case "deploy":
    case "domain":
    case "monitoring":
      return idsFuerAnbieter(verbindungen, ["vercel"]);
    case "indexierung":
      return idsFuerAnbieter(verbindungen, ["google_search_console"]);
    case "werbemittel":
      return idsFuerAnbieter(verbindungen, ["higgsfield"]);
    case "ads":
      return idsFuerAnbieter(verbindungen, ["meta_ads", "tiktok_ads", "youtube", "google_ads"]);
    case "planen":
    case "sandbox":
      return [];
  }
}

function jsonAusText(text: string): unknown {
  const ohneFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = ohneFence.indexOf("{");
  const ende = ohneFence.lastIndexOf("}");
  if (start < 0 || ende <= start) throw new Error("Planungsmodell lieferte kein JSON-Objekt.");
  return JSON.parse(ohneFence.slice(start, ende + 1)) as unknown;
}

function systemPrompt(): string {
  return [
    "Du bist der interne Planer von Build your Buissness (BYB).",
    "Zerlege das Nutzerziel in einen kleinen, ausführbaren Aktionsgraphen.",
    "Antworte ausschließlich als JSON-Objekt mit dem Feld aktionen.",
    "Jede Aktion hat typ, titel, beschreibung und abhaengigkeiten.",
    `Erlaubte Typen: ${AktionstypSchema.options.join(", ")}.`,
    "abhaengigkeiten ist ein Array aus nullbasierten Indizes früherer Aktionen.",
    "Plane nur Schritte, die für das konkrete Ziel nötig sind; keine erfundenen Ergebnisse.",
    "Deploy, Domain, Indexierung und Payments werden später separat freigegeben.",
    "Ads werden später separat mit Budget freigegeben.",
    "Keine Secrets, Tokens, Zugangsdaten, URLs mit Credentials oder personenbezogenen Daten erfinden.",
  ].join("\n");
}

function nutzerPrompt(ziel: string, verbindungen: readonly ConnectorVerbindung[]): string {
  const bereit = verbindungen
    .filter((verbindung) => verbindung.status === "verbunden")
    .map((verbindung) => verbindung.anbieter)
    .filter((anbieter, index, alle) => alle.indexOf(anbieter) === index);
  return [
    `Ziel: ${ziel}`,
    `Bereits verbundene Anbieter: ${bereit.length > 0 ? bereit.join(", ") : "keine"}.`,
    "Fehlende Verbindungen dürfen als notwendiger späterer Blocker sichtbar bleiben; erfinde sie nicht als verbunden.",
  ].join("\n");
}

export async function auftragAusZielPlanen(
  nutzerId: string,
  ziel: string,
  creditDeckel: number,
  verbindungen: readonly ConnectorVerbindung[],
  optionen: PlanerOptionen = {},
): Promise<AuftragTyp> {
  const zielText = z.string().trim().min(10).max(4_000).parse(ziel);
  const nutzer = z.string().trim().min(1).max(300).parse(nutzerId);
  const deckel = z.number().int().min(1).max(100_000).parse(creditDeckel);
  const frage = optionen.fragenImpl ?? ((rolle, auftrag) => fragen(rolle, auftrag));
  const antwort = await frage("schnell", {
    system: systemPrompt(),
    prompt: nutzerPrompt(zielText, verbindungen),
  });
  const plan = PlanAntwort.parse(jsonAusText(antwort.text));
  const jetzt = optionen.jetzt?.() ?? Date.now();
  const auftragId = `auftrag-${optionen.idErzeugen?.() ?? randomUUID()}`;
  const aktionsIds = plan.aktionen.map((aktion, index) => `${index + 1}-${aktion.typ}`);

  const aktionen: Aktion[] = plan.aktionen.map((aktion, index) => ({
    id: aktionsIds[index] as string,
    typ: aktion.typ,
    titel: aktion.titel,
    beschreibung: aktion.beschreibung,
    zustand: "geplant",
    abhaengigkeiten: aktion.abhaengigkeiten.map((abhaengigkeit) => aktionsIds[abhaengigkeit] as string),
    verbindung_ids: verbindungenFuerAktion(aktion.typ, verbindungen),
    freigabe: freigabeFuer(aktion.typ),
    credits_geschaetzt: CREDIT_SCHAETZUNG[aktion.typ],
    credits_verbraucht: 0,
  }));

  return Auftrag.parse({
    version: 1,
    id: auftragId,
    projekt_id: "workspace-default",
    nutzer_id: nutzer,
    ziel: zielText,
    zustand: "plan_bereit",
    credit_deckel: deckel,
    credits_verbraucht: 0,
    aktionen,
    ereignisse: [
      {
        id: `${auftragId}-erstellt`,
        typ: "auftrag_erstellt",
        zeitstempel: jetzt,
        klartext: "BYB hat das Ziel aufgenommen.",
      },
      {
        id: `${auftragId}-plan`,
        typ: "plan_geaendert",
        zeitstempel: jetzt + 1,
        klartext: `BYB hat einen Plan mit ${aktionen.length} Aktionen erstellt.`,
      },
    ],
  });
}
