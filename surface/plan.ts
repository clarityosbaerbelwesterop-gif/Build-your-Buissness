import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { ConnectorVerbindung } from "../connector-hub/v1.js";
import { verbindungenFuerAktion } from "../control-plane/planer.js";
import { Auftrag, type Auftrag as AuftragTyp } from "../control-plane/v1.js";
import { SURFACE_AKTION, SURFACE_PROJEKT_ID } from "./v1.js";

export const SurfaceIdee = z.string().trim().min(10).max(4_000);

export interface SurfacePlanOptionen {
  readonly jetzt?: () => number;
  readonly idErzeugen?: () => string;
}

export function istSurfaceAuftrag(auftrag: AuftragTyp): boolean {
  return auftrag.projekt_id === SURFACE_PROJEKT_ID
    && auftrag.aktionen.some((aktion) => aktion.id === SURFACE_AKTION.landing)
    && auftrag.aktionen.some((aktion) => aktion.id === SURFACE_AKTION.lead)
    && auftrag.aktionen.some((aktion) => aktion.id === SURFACE_AKTION.agent);
}

export function surfaceAuftragPlanen(
  nutzerId: string,
  idee: string,
  verbindungen: readonly ConnectorVerbindung[],
  optionen: SurfacePlanOptionen = {},
): AuftragTyp {
  const ziel = SurfaceIdee.parse(idee);
  const nutzer = z.string().trim().min(1).max(300).parse(nutzerId);
  const jetzt = optionen.jetzt?.() ?? Date.now();
  const auftragId = `auftrag-${optionen.idErzeugen?.() ?? randomUUID()}`;

  return Auftrag.parse({
    version: 1,
    id: auftragId,
    projekt_id: SURFACE_PROJEKT_ID,
    nutzer_id: nutzer,
    ziel,
    zustand: "plan_bereit",
    credit_deckel: 80,
    credits_verbraucht: 0,
    aktionen: [
      {
        id: SURFACE_AKTION.landing,
        typ: "code",
        titel: "Landing-Vorschau erstellen",
        beschreibung: "BYB erzeugt aus der Idee eine verkaufbare Angebotsseite.",
        zustand: "geplant",
        abhaengigkeiten: [],
        verbindung_ids: verbindungenFuerAktion("code", verbindungen),
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 40,
        credits_verbraucht: 0,
      },
      {
        id: SURFACE_AKTION.lead,
        typ: "backend",
        titel: "Anfragen aufnehmen",
        beschreibung: "BYB richtet die Aufnahme für Interessenten auf der Angebotsseite ein.",
        zustand: "geplant",
        abhaengigkeiten: [SURFACE_AKTION.landing],
        verbindung_ids: verbindungenFuerAktion("backend", verbindungen),
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 24,
        credits_verbraucht: 0,
      },
      {
        id: SURFACE_AKTION.agent,
        typ: "planen",
        titel: "Agent starten",
        beschreibung: "BYB startet einen Agenten, der Anfragen zur Idee weiterbearbeitet.",
        zustand: "geplant",
        abhaengigkeiten: [SURFACE_AKTION.lead],
        verbindung_ids: verbindungenFuerAktion("planen", verbindungen),
        freigabe: { klasse: "intern", status: "nicht_erforderlich" },
        credits_geschaetzt: 4,
        credits_verbraucht: 0,
      },
    ],
    ereignisse: [
      {
        id: `${auftragId}-erstellt`,
        typ: "auftrag_erstellt",
        zeitstempel: jetzt,
        klartext: "BYB hat die Idee aufgenommen.",
      },
      {
        id: `${auftragId}-plan`,
        typ: "plan_geaendert",
        zeitstempel: jetzt + 1,
        klartext: "BYB hat den festen Ablauf Landing, Anfragen, Agent gesetzt.",
      },
    ],
  });
}
