import { z } from "zod";

import type { ConnectorVerbindung } from "../connector-hub/v1.js";
import {
  aktionAbschliessen,
  aktionStarten,
  type Auftrag as AuftragTyp,
} from "../control-plane/v1.js";
import {
  agentStarten,
  studioKnotenAufrufen,
  verbrauchMelden,
  type AdapterAntwort,
  type AdapterFetch,
} from "./adapter.js";
import { landingHtml, landingKopieErzeugen, type LandingOptionen } from "./landing.js";
import { istSurfaceAuftrag, surfaceAuftragPlanen, type SurfacePlanOptionen } from "./plan.js";
import {
  SURFACE_AKTION,
  SurfaceLauf,
  surfaceErgebnisLesen,
  surfaceErgebnisSchreiben,
  type SurfaceAktionsErgebnis,
  type SurfaceLauf as SurfaceLaufTyp,
  type SurfaceSchrittZustand,
} from "./v1.js";

export interface SurfaceLaufOptionen extends SurfacePlanOptionen, LandingOptionen {
  readonly fetchImpl?: AdapterFetch;
  readonly umgebung?: Record<string, string | undefined>;
  readonly leadsAnzahl?: number;
}

const SURFACE_HINWEIS = {
  landingBereit: "Landing-Vorschau aus deiner Idee. Noch keine öffentliche Veröffentlichung.",
  landingVerbunden: "Landing-Vorschau steht. Die verbundene Erzeugung hat den Auftrag angenommen.",
  landingUnklar: "Landing-Vorschau steht. Die verbundene Erzeugung war nicht erreichbar.",
  leadAktiv: "Anfragen werden in BYB gespeichert. Keine fremde Kundenliste, kein Zahlungsfluss.",
  leadInaktiv: "Anfragen-Aufnahme ist geplant, Speichern ist noch nicht verfügbar.",
  agentBereit: "Ein Agent läuft für diese Idee.",
  agentOffen: "Kein Agent verbunden. Anfragen bleiben in BYB.",
  agentUnklar: "Die Agenten-Laufzeit war nicht erreichbar. Es wurde kein lokaler Ersatz gestartet.",
} as const;

function adapterZuSchritt(status: AdapterAntwort["status"]): SurfaceSchrittZustand {
  if (status === "verbunden") return "laeuft";
  if (status === "unerreichbar") return "fehlgeschlagen";
  return "nicht_verbunden";
}

async function aktionDurchfuehren(
  auftrag: AuftragTyp,
  aktionId: string,
  ergebnis: SurfaceAktionsErgebnis,
  zeitstempel: number,
  umgebung: Record<string, string | undefined>,
  fetchImpl: AdapterFetch | undefined,
): Promise<AuftragTyp> {
  const gestartet = aktionStarten(auftrag, aktionId, zeitstempel);
  await verbrauchMelden({
    idee: auftrag.ziel,
    auftragId: auftrag.id,
    aktionId,
    credits: gestartet.aktionen.find((aktion) => aktion.id === aktionId)?.credits_geschaetzt ?? 0,
    umgebung,
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  });
  return aktionAbschliessen(
    gestartet,
    aktionId,
    surfaceErgebnisSchreiben(ergebnis),
    0,
    zeitstempel + 1,
  );
}

export async function surfaceLaufErzeugen(
  nutzerId: string,
  idee: string,
  verbindungen: readonly ConnectorVerbindung[],
  optionen: SurfaceLaufOptionen = {},
): Promise<{ readonly auftrag: AuftragTyp; readonly lauf: SurfaceLaufTyp }> {
  const umgebung = optionen.umgebung ?? process.env;
  let auftrag = surfaceAuftragPlanen(nutzerId, idee, verbindungen, optionen);
  const jetzt = optionen.jetzt?.() ?? Date.now();
  const fetchOpt = optionen.fetchImpl === undefined ? {} : { fetchImpl: optionen.fetchImpl };

  const kopie = await landingKopieErzeugen(idee, optionen);
  const studio = await studioKnotenAufrufen({
    idee: auftrag.ziel,
    auftragId: auftrag.id,
    aktionId: SURFACE_AKTION.landing,
    umgebung,
    ...fetchOpt,
  });
  auftrag = await aktionDurchfuehren(
    auftrag,
    SURFACE_AKTION.landing,
    { v: 1, art: "landing", kopie, studio: studio.status },
    jetzt,
    umgebung,
    optionen.fetchImpl,
  );

  auftrag = await aktionDurchfuehren(
    auftrag,
    SURFACE_AKTION.lead,
    { v: 1, art: "lead", aktiv: true },
    jetzt + 10,
    umgebung,
    optionen.fetchImpl,
  );

  const agent = await agentStarten({
    idee: auftrag.ziel,
    auftragId: auftrag.id,
    aktionId: SURFACE_AKTION.agent,
    umgebung,
    ...fetchOpt,
  });
  const agentErgebnis: SurfaceAktionsErgebnis = agent.referenz === undefined
    ? {
        v: 1,
        art: "agent",
        zustand: agent.status === "verbunden" ? "laeuft" : agent.status === "unerreichbar" ? "unerreichbar" : "nicht_verbunden",
      }
    : {
        v: 1,
        art: "agent",
        zustand: agent.status === "verbunden" ? "laeuft" : agent.status === "unerreichbar" ? "unerreichbar" : "nicht_verbunden",
        referenz: agent.referenz,
      };
  auftrag = await aktionDurchfuehren(
    auftrag,
    SURFACE_AKTION.agent,
    agentErgebnis,
    jetzt + 20,
    umgebung,
    optionen.fetchImpl,
  );

  return {
    auftrag,
    lauf: surfaceLaufAusAuftrag(auftrag, optionen.leadsAnzahl ?? 0),
  };
}

function hinweisLanding(studio: "verbunden" | "nicht_verbunden" | "unerreichbar"): string {
  if (studio === "verbunden") return SURFACE_HINWEIS.landingVerbunden;
  if (studio === "unerreichbar") return SURFACE_HINWEIS.landingUnklar;
  return SURFACE_HINWEIS.landingBereit;
}

function hinweisAgent(zustand: "laeuft" | "nicht_verbunden" | "unerreichbar"): string {
  if (zustand === "laeuft") return SURFACE_HINWEIS.agentBereit;
  if (zustand === "unerreichbar") return SURFACE_HINWEIS.agentUnklar;
  return SURFACE_HINWEIS.agentOffen;
}

export function surfaceLaufAusAuftrag(
  auftrag: AuftragTyp,
  leadsAnzahl = 0,
): SurfaceLaufTyp {
  if (!istSurfaceAuftrag(auftrag)) {
    throw new Error("Auftrag ist kein Surface-v1-Lauf.");
  }

  const landingAktion = auftrag.aktionen.find((aktion) => aktion.id === SURFACE_AKTION.landing);
  const leadAktion = auftrag.aktionen.find((aktion) => aktion.id === SURFACE_AKTION.lead);
  const agentAktion = auftrag.aktionen.find((aktion) => aktion.id === SURFACE_AKTION.agent);
  if (landingAktion === undefined || leadAktion === undefined || agentAktion === undefined) {
    throw new Error("Surface-Auftrag unvollständig.");
  }

  const landingRoh = landingAktion.ergebnis === undefined
    ? undefined
    : surfaceErgebnisLesen(landingAktion.ergebnis);
  const leadRoh = leadAktion.ergebnis === undefined
    ? undefined
    : surfaceErgebnisLesen(leadAktion.ergebnis);
  const agentRoh = agentAktion.ergebnis === undefined
    ? undefined
    : surfaceErgebnisLesen(agentAktion.ergebnis);

  const landingKopie = landingRoh?.art === "landing" ? landingRoh.kopie : undefined;
  const studio = landingRoh?.art === "landing" ? landingRoh.studio : "nicht_verbunden";
  const leadAktiv = leadRoh?.art === "lead" ? leadRoh.aktiv : false;
  const agentZustand = agentRoh?.art === "agent" ? agentRoh.zustand : "nicht_verbunden";
  const agentRef = agentRoh?.art === "agent" ? agentRoh.referenz : undefined;

  const landingHinweis = hinweisLanding(studio);
  const agentHinweis = hinweisAgent(agentZustand);
  const leadHinweis = leadAktiv ? SURFACE_HINWEIS.leadAktiv : SURFACE_HINWEIS.leadInaktiv;
  const landingSchrittZustand: SurfaceSchrittZustand = "bereit";

  const schritte = [
    {
      art: "landing" as const,
      titel: landingAktion.titel,
      zustand: landingSchrittZustand,
      hinweis: landingHinweis,
    },
    {
      art: "lead" as const,
      titel: leadAktion.titel,
      zustand: leadAktiv ? "bereit" as const : "nicht_verbunden" as const,
      hinweis: leadHinweis,
    },
    {
      art: "agent" as const,
      titel: agentAktion.titel,
      zustand: adapterZuSchritt(
        agentZustand === "laeuft"
          ? "verbunden"
          : agentZustand === "unerreichbar"
            ? "unerreichbar"
            : "nicht_verbunden",
      ),
      hinweis: agentHinweis,
    },
  ];

  const fehlgeschlagen = schritte.some((schritt) => schritt.zustand === "fehlgeschlagen");
  const agentOffen = schritte[2]?.zustand === "nicht_verbunden";
  const zustand = fehlgeschlagen
    ? "fehlgeschlagen"
    : agentOffen
      ? "teilweise"
      : "bereit";

  return SurfaceLauf.parse({
    version: 1,
    auftrag_id: auftrag.id,
    idee: auftrag.ziel,
    zustand,
    landing: {
      zustand: landingSchrittZustand,
      hinweis: landingHinweis,
      ...(landingKopie === undefined
        ? {}
        : { kopie: landingKopie, html: landingHtml(landingKopie) }),
    },
    lead: {
      zustand: leadAktiv ? "bereit" : "nicht_verbunden",
      hinweis: leadHinweis,
      aktiv: leadAktiv,
      anzahl: z.number().int().min(0).parse(leadsAnzahl),
    },
    agent: {
      zustand: adapterZuSchritt(
        agentZustand === "laeuft"
          ? "verbunden"
          : agentZustand === "unerreichbar"
            ? "unerreichbar"
            : "nicht_verbunden",
      ),
      hinweis: agentHinweis,
      ...(agentRef === undefined ? {} : { referenz: agentRef }),
    },
    schritte,
    credits_geschaetzt: auftrag.aktionen.reduce((summe, aktion) => summe + aktion.credits_geschaetzt, 0),
    credits_verbraucht: auftrag.credits_verbraucht,
  });
}
