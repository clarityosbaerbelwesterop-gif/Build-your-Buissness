import { z } from "zod";

export const CONTROL_PLANE_VERSION = 1 as const;

export const Anbieter = z.enum([
  "github",
  "vercel",
  "neon",
  "supabase",
  "stripe",
  "google_search_console",
  "higgsfield",
  "meta_ads",
  "tiktok_ads",
]);
export type Anbieter = z.infer<typeof Anbieter>;

export const Verbindungsart = z.enum(["oauth", "mcp", "api"]);
export type Verbindungsart = z.infer<typeof Verbindungsart>;

export const Verbindungszustand = z.enum([
  "verbunden",
  "erneut_anmelden",
  "getrennt",
]);
export type Verbindungszustand = z.infer<typeof Verbindungszustand>;

export const Ressourcenart = z.enum([
  "repo",
  "hosting_projekt",
  "datenbank_projekt",
  "stripe_konto",
  "search_property",
  "higgsfield_workspace",
  "ads_konto",
]);
export type Ressourcenart = z.infer<typeof Ressourcenart>;

export const Ressource = z
  .object({
    id: z.string().min(1).max(300),
    art: Ressourcenart,
    name: z.string().min(1).max(200),
  })
  .strict();
export type Ressource = z.infer<typeof Ressource>;

/**
 * Eine Verbindung enthält ausschließlich Referenzen auf ein verbundenes Konto
 * und dessen freigegebene Ressourcen. OAuth-Tokens, API-Keys und andere Secrets
 * gehören in den Secret-Store des jeweiligen Connectors und ausdrücklich nicht
 * in diesen Vertrag.
 */
export const Verbindung = z
  .object({
    id: z.string().min(1).max(120),
    anbieter: Anbieter,
    art: Verbindungsart,
    konto_ref: z.string().min(1).max(300),
    zustand: Verbindungszustand,
    ressourcen: z.array(Ressource).max(500),
  })
  .strict();
export type Verbindung = z.infer<typeof Verbindung>;

const RessourcenAuswahl = z
  .object({
    verbindung_id: z.string().min(1),
    ressourcen_id: z.string().min(1),
  })
  .strict();

export const BackendAuswahl = z.discriminatedUnion("anbieter", [
  RessourcenAuswahl.extend({ anbieter: z.literal("neon") }).strict(),
  RessourcenAuswahl.extend({ anbieter: z.literal("supabase") }).strict(),
]);
export type BackendAuswahl = z.infer<typeof BackendAuswahl>;

export const Projekt = z
  .object({
    id: z.string().min(1).max(120),
    nutzer_id: z.string().min(1).max(300),
    name: z.string().min(1).max(200),
    github: RessourcenAuswahl,
    vercel: RessourcenAuswahl,
    backend: BackendAuswahl,
    optionale_verbindungen: z.array(z.string().min(1)).max(20),
  })
  .strict();
export type Projekt = z.infer<typeof Projekt>;

export const Auftragszustand = z.enum([
  "entwurf",
  "plan_bereit",
  "laeuft",
  "wartet_freigabe",
  "pausiert",
  "abgeschlossen",
  "fehlgeschlagen",
]);
export type Auftragszustand = z.infer<typeof Auftragszustand>;

export const Aktionstyp = z.enum([
  "planen",
  "repo",
  "code",
  "backend",
  "auth",
  "payments",
  "test",
  "sandbox",
  "security",
  "fix",
  "deploy",
  "domain",
  "indexierung",
  "werbemittel",
  "ads",
  "monitoring",
]);
export type Aktionstyp = z.infer<typeof Aktionstyp>;

export const Aktionszustand = z.enum([
  "geplant",
  "laeuft",
  "erfolgreich",
  "fehlgeschlagen",
  "uebersprungen",
]);
export type Aktionszustand = z.infer<typeof Aktionszustand>;

export const Freigabeklasse = z.enum(["intern", "extern", "finanziell"]);
export type Freigabeklasse = z.infer<typeof Freigabeklasse>;

export const Freigabestatus = z.enum([
  "nicht_erforderlich",
  "offen",
  "erteilt",
  "widerrufen",
]);
export type Freigabestatus = z.infer<typeof Freigabestatus>;

export const Freigabe = z
  .object({
    klasse: Freigabeklasse,
    status: Freigabestatus,
    /** Referenz auf eine spätere Dauer-/Budgetfreigabe; nie ein Zugangstoken. */
    rahmen_id: z.string().min(1).max(120).optional(),
  })
  .strict()
  .superRefine((freigabe, kontext) => {
    if (freigabe.klasse === "intern" && freigabe.status !== "nicht_erforderlich") {
      kontext.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Interne Aktionen brauchen keine Nutzerfreigabe.",
      });
    }
    if (freigabe.klasse !== "intern" && freigabe.status === "nicht_erforderlich") {
      kontext.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Externe und finanzielle Aktionen brauchen eine Freigabegrenze.",
      });
    }
  });
export type Freigabe = z.infer<typeof Freigabe>;

export const Aktion = z
  .object({
    id: z.string().min(1).max(120),
    typ: Aktionstyp,
    titel: z.string().min(3).max(160),
    beschreibung: z.string().min(3).max(600),
    zustand: Aktionszustand,
    abhaengigkeiten: z.array(z.string().min(1)).max(50),
    verbindung_ids: z.array(z.string().min(1)).max(20),
    freigabe: Freigabe,
    credits_geschaetzt: z.number().int().min(0),
    credits_verbraucht: z.number().int().min(0),
    ergebnis: z.string().min(1).max(2_000).optional(),
  })
  .strict();
export type Aktion = z.infer<typeof Aktion>;

export const Ereignistyp = z.enum([
  "auftrag_erstellt",
  "plan_geaendert",
  "freigabe_erteilt",
  "aktion_gestartet",
  "aktion_abgeschlossen",
  "aktion_fehlgeschlagen",
]);
export type Ereignistyp = z.infer<typeof Ereignistyp>;

export const Ereignis = z
  .object({
    id: z.string().min(1).max(160),
    typ: Ereignistyp,
    zeitstempel: z.number().int().min(0),
    klartext: z.string().min(3).max(600),
    aktion_id: z.string().min(1).optional(),
  })
  .strict();
export type Ereignis = z.infer<typeof Ereignis>;

export const Auftrag = z
  .object({
    version: z.literal(CONTROL_PLANE_VERSION),
    id: z.string().min(1).max(120),
    projekt_id: z.string().min(1).max(120),
    nutzer_id: z.string().min(1).max(300),
    ziel: z.string().min(10).max(4_000),
    zustand: Auftragszustand,
    credit_deckel: z.number().int().min(0),
    credits_verbraucht: z.number().int().min(0),
    aktionen: z.array(Aktion).max(500),
    ereignisse: z.array(Ereignis).max(10_000),
  })
  .strict()
  .superRefine((auftrag, kontext) => {
    const ids = new Set<string>();
    for (const [index, aktion] of auftrag.aktionen.entries()) {
      if (ids.has(aktion.id)) {
        kontext.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aktionen", index, "id"],
          message: "Aktions-IDs müssen innerhalb eines Auftrags eindeutig sein.",
        });
      }
      ids.add(aktion.id);
    }

    for (const [index, aktion] of auftrag.aktionen.entries()) {
      for (const abhaengigkeit of aktion.abhaengigkeiten) {
        if (abhaengigkeit === aktion.id || !ids.has(abhaengigkeit)) {
          kontext.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["aktionen", index, "abhaengigkeiten"],
            message: "Abhängigkeiten müssen auf eine andere Aktion desselben Auftrags zeigen.",
          });
        }
      }
    }
  });
export type Auftrag = z.infer<typeof Auftrag>;

export function auftragLesen(roh: unknown): Auftrag {
  return Auftrag.parse(roh);
}

function aktionNachId(auftrag: Auftrag, id: string): Aktion {
  const aktion = auftrag.aktionen.find((eintrag) => eintrag.id === id);
  if (aktion === undefined) throw new Error(`Unbekannte Aktion: ${id}`);
  return aktion;
}

function freigabeReicht(aktion: Aktion): boolean {
  return (
    aktion.freigabe.status === "nicht_erforderlich" ||
    aktion.freigabe.status === "erteilt"
  );
}

function abhaengigkeitenErfuellt(auftrag: Auftrag, aktion: Aktion): boolean {
  return aktion.abhaengigkeiten.every(
    (id) => aktionNachId(auftrag, id).zustand === "erfolgreich",
  );
}

export function aktionStartbar(auftrag: Auftrag, aktion: Aktion): boolean {
  if (aktion.zustand !== "geplant") return false;
  if (!freigabeReicht(aktion)) return false;
  if (!abhaengigkeitenErfuellt(auftrag, aktion)) return false;
  return auftrag.credits_verbraucht + aktion.credits_geschaetzt <= auftrag.credit_deckel;
}

export function naechsteAktionen(auftrag: Auftrag): readonly Aktion[] {
  return auftrag.aktionen.filter((aktion) => aktionStartbar(auftrag, aktion));
}

function ereignisId(auftrag: Auftrag, zeitstempel: number): string {
  return `${auftrag.id}-${auftrag.ereignisse.length + 1}-${zeitstempel}`;
}

export function freigabeErteilen(
  auftrag: Auftrag,
  aktionId: string,
  rahmenId: string,
  zeitstempel: number,
): Auftrag {
  const aktion = aktionNachId(auftrag, aktionId);
  if (aktion.freigabe.klasse === "intern") {
    throw new Error("Interne Aktionen brauchen keine Freigabe.");
  }
  if (aktion.zustand !== "geplant") {
    throw new Error("Nur geplante Aktionen können freigegeben werden.");
  }

  const aktionen = auftrag.aktionen.map((eintrag) =>
    eintrag.id === aktionId
      ? {
          ...eintrag,
          freigabe: {
            klasse: eintrag.freigabe.klasse,
            status: "erteilt" as const,
            rahmen_id: rahmenId,
          },
        }
      : eintrag,
  );

  return Auftrag.parse({
    ...auftrag,
    aktionen,
    ereignisse: [
      ...auftrag.ereignisse,
      {
        id: ereignisId(auftrag, zeitstempel),
        typ: "freigabe_erteilt",
        zeitstempel,
        klartext: `Freigabe für „${aktion.titel}“ erteilt.`,
        aktion_id: aktionId,
      },
    ],
  });
}

export function aktionStarten(
  auftrag: Auftrag,
  aktionId: string,
  zeitstempel: number,
): Auftrag {
  const aktion = aktionNachId(auftrag, aktionId);
  if (!aktionStartbar(auftrag, aktion)) {
    throw new Error(`Aktion ist noch nicht startbar: ${aktionId}`);
  }

  const aktionen = auftrag.aktionen.map((eintrag) =>
    eintrag.id === aktionId ? { ...eintrag, zustand: "laeuft" as const } : eintrag,
  );

  return Auftrag.parse({
    ...auftrag,
    zustand: "laeuft",
    aktionen,
    ereignisse: [
      ...auftrag.ereignisse,
      {
        id: ereignisId(auftrag, zeitstempel),
        typ: "aktion_gestartet",
        zeitstempel,
        klartext: `BYB startet „${aktion.titel}“.`,
        aktion_id: aktionId,
      },
    ],
  });
}

export function aktionAbschliessen(
  auftrag: Auftrag,
  aktionId: string,
  ergebnis: string,
  creditsVerbraucht: number,
  zeitstempel: number,
): Auftrag {
  const aktion = aktionNachId(auftrag, aktionId);
  if (aktion.zustand !== "laeuft") {
    throw new Error("Nur eine laufende Aktion kann abgeschlossen werden.");
  }
  if (!Number.isInteger(creditsVerbraucht) || creditsVerbraucht < 0) {
    throw new Error("Verbrauchte Credits müssen eine nichtnegative Ganzzahl sein.");
  }

  const aktionen = auftrag.aktionen.map((eintrag) =>
    eintrag.id === aktionId
      ? {
          ...eintrag,
          zustand: "erfolgreich" as const,
          credits_verbraucht: creditsVerbraucht,
          ergebnis,
        }
      : eintrag,
  );

  const alleFertig = aktionen.every((eintrag) =>
    ["erfolgreich", "uebersprungen"].includes(eintrag.zustand),
  );

  return Auftrag.parse({
    ...auftrag,
    zustand: alleFertig ? "abgeschlossen" : "laeuft",
    credits_verbraucht: auftrag.credits_verbraucht + creditsVerbraucht,
    aktionen,
    ereignisse: [
      ...auftrag.ereignisse,
      {
        id: ereignisId(auftrag, zeitstempel),
        typ: "aktion_abgeschlossen",
        zeitstempel,
        klartext: `„${aktion.titel}“ abgeschlossen: ${ergebnis}`,
        aktion_id: aktionId,
      },
    ],
  });
}
