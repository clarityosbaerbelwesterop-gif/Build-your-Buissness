import { z } from "zod";

export const CONNECTOR_HUB_VERSION = 1 as const;

export const ConnectorAnbieter = z.enum([
  "github",
  "neon",
  "supabase",
  "vercel",
  "stripe",
  "higgsfield",
  "meta_ads",
  "tiktok_ads",
  "youtube",
  "google_search_console",
  "google_ads",
  "wix",
]);
export type ConnectorAnbieter = z.infer<typeof ConnectorAnbieter>;

export const Verbindungsmodus = z.enum(["oauth", "mcp", "api_key", "service_account"]);
export type Verbindungsmodus = z.infer<typeof Verbindungsmodus>;

export const ConnectorStatus = z.enum(["verbunden", "erneut_anmelden", "getrennt"]);
export type ConnectorStatus = z.infer<typeof ConnectorStatus>;

export const Ressourcenart = z.enum([
  "repo",
  "datenbank_projekt",
  "vercel_projekt",
  "stripe_konto",
  "higgsfield_workspace",
  "meta_ads_konto",
  "tiktok_ads_konto",
  "youtube_kanal",
  "search_console_property",
  "google_ads_konto",
  "wix_site",
]);
export type Ressourcenart = z.infer<typeof Ressourcenart>;

export const ConnectorRessource = z
  .object({
    id: z.string().trim().min(1).max(300),
    art: Ressourcenart,
    name: z.string().trim().min(1).max(200),
  })
  .strict();
export type ConnectorRessource = z.infer<typeof ConnectorRessource>;

/**
 * Der Hub speichert nur stabile Referenzen. Tokens, API-Keys und Refresh-Tokens
 * bleiben im Secret-Store des jeweiligen Connector-Adapters.
 */
export const ConnectorVerbindung = z
  .object({
    version: z.literal(CONNECTOR_HUB_VERSION),
    id: z.string().trim().min(1).max(120),
    anbieter: ConnectorAnbieter,
    modus: Verbindungsmodus,
    konto_ref: z.string().trim().min(1).max(300),
    status: ConnectorStatus,
    scopes: z.array(z.string().trim().min(1).max(200)).max(100),
    ressourcen: z.array(ConnectorRessource).max(2_000),
  })
  .strict();
export type ConnectorVerbindung = z.infer<typeof ConnectorVerbindung>;

export const RessourcenAuswahl = z
  .object({
    verbindung_id: z.string().trim().min(1).max(120),
    ressourcen_id: z.string().trim().min(1).max(300),
  })
  .strict();
export type RessourcenAuswahl = z.infer<typeof RessourcenAuswahl>;

export const BackendAuswahl = z.discriminatedUnion("anbieter", [
  RessourcenAuswahl.extend({ anbieter: z.literal("neon") }).strict(),
  RessourcenAuswahl.extend({ anbieter: z.literal("supabase") }).strict(),
]);
export type BackendAuswahl = z.infer<typeof BackendAuswahl>;

export const WerbeZielAuswahl = z.discriminatedUnion("anbieter", [
  RessourcenAuswahl.extend({ anbieter: z.literal("meta_ads") }).strict(),
  RessourcenAuswahl.extend({ anbieter: z.literal("tiktok_ads") }).strict(),
  RessourcenAuswahl.extend({ anbieter: z.literal("youtube") }).strict(),
  RessourcenAuswahl.extend({ anbieter: z.literal("google_ads") }).strict(),
]);
export type WerbeZielAuswahl = z.infer<typeof WerbeZielAuswahl>;

export const UnternehmensWerkzeuge = z
  .object({
    github_repo: RessourcenAuswahl,
    backend: BackendAuswahl,
    vercel_projekt: RessourcenAuswahl,
    payments: RessourcenAuswahl.optional(),
    indexierung: RessourcenAuswahl.optional(),
    landingpage: RessourcenAuswahl.optional(),
    werbung: z
      .object({
        kreativ: RessourcenAuswahl,
        ziele: z.array(WerbeZielAuswahl).min(1).max(20),
      })
      .strict()
      .optional(),
  })
  .strict();
export type UnternehmensWerkzeuge = z.infer<typeof UnternehmensWerkzeuge>;

type ErwarteteRessource = {
  readonly anbieter: ConnectorAnbieter;
  readonly art: Ressourcenart;
};

function verbindungNachId(
  verbindungen: readonly ConnectorVerbindung[],
  id: string,
): ConnectorVerbindung {
  const verbindung = verbindungen.find((eintrag) => eintrag.id === id);
  if (verbindung === undefined) throw new Error(`Unbekannte Verbindung: ${id}`);
  if (verbindung.status !== "verbunden") {
    throw new Error(`Verbindung ist nicht arbeitsbereit: ${id}`);
  }
  return verbindung;
}

function auswahlPruefen(
  verbindungen: readonly ConnectorVerbindung[],
  auswahl: RessourcenAuswahl,
  erwartet: ErwarteteRessource,
): ConnectorRessource {
  const verbindung = verbindungNachId(verbindungen, auswahl.verbindung_id);
  if (verbindung.anbieter !== erwartet.anbieter) {
    throw new Error(`Falscher Anbieter für Ressource: erwartet ${erwartet.anbieter}.`);
  }
  const ressource = verbindung.ressourcen.find(
    (eintrag) => eintrag.id === auswahl.ressourcen_id,
  );
  if (ressource === undefined) {
    throw new Error(`Ressource gehört nicht zur ausgewählten Verbindung: ${auswahl.ressourcen_id}`);
  }
  if (ressource.art !== erwartet.art) {
    throw new Error(`Falsche Ressourcenart: erwartet ${erwartet.art}.`);
  }
  return ressource;
}

export interface AufgeloesteWerkzeuge {
  readonly githubRepo: ConnectorRessource;
  readonly backend: ConnectorRessource;
  readonly vercelProjekt: ConnectorRessource;
  readonly stripeKonto?: ConnectorRessource;
  readonly searchProperty?: ConnectorRessource;
  readonly wixSite?: ConnectorRessource;
  readonly higgsfieldWorkspace?: ConnectorRessource;
  readonly werbeZiele: readonly ConnectorRessource[];
}

export function werkzeugeAufloesen(
  verbindungenRoh: readonly ConnectorVerbindung[],
  auswahlRoh: UnternehmensWerkzeuge,
): AufgeloesteWerkzeuge {
  const verbindungen = z.array(ConnectorVerbindung).parse(verbindungenRoh);
  const auswahl = UnternehmensWerkzeuge.parse(auswahlRoh);

  const githubRepo = auswahlPruefen(verbindungen, auswahl.github_repo, {
    anbieter: "github",
    art: "repo",
  });
  const backend = auswahlPruefen(verbindungen, auswahl.backend, {
    anbieter: auswahl.backend.anbieter,
    art: "datenbank_projekt",
  });
  const vercelProjekt = auswahlPruefen(verbindungen, auswahl.vercel_projekt, {
    anbieter: "vercel",
    art: "vercel_projekt",
  });

  const stripeKonto = auswahl.payments === undefined
    ? undefined
    : auswahlPruefen(verbindungen, auswahl.payments, {
        anbieter: "stripe",
        art: "stripe_konto",
      });

  const searchProperty = auswahl.indexierung === undefined
    ? undefined
    : auswahlPruefen(verbindungen, auswahl.indexierung, {
        anbieter: "google_search_console",
        art: "search_console_property",
      });

  const wixSite = auswahl.landingpage === undefined
    ? undefined
    : auswahlPruefen(verbindungen, auswahl.landingpage, {
        anbieter: "wix",
        art: "wix_site",
      });

  let higgsfieldWorkspace: ConnectorRessource | undefined;
  let werbeZiele: ConnectorRessource[] = [];
  if (auswahl.werbung !== undefined) {
    higgsfieldWorkspace = auswahlPruefen(verbindungen, auswahl.werbung.kreativ, {
      anbieter: "higgsfield",
      art: "higgsfield_workspace",
    });

    const zielSchluessel = new Set<string>();
    werbeZiele = auswahl.werbung.ziele.map((ziel) => {
      const art: Ressourcenart =
        ziel.anbieter === "meta_ads" ? "meta_ads_konto"
        : ziel.anbieter === "tiktok_ads" ? "tiktok_ads_konto"
        : ziel.anbieter === "youtube" ? "youtube_kanal"
        : "google_ads_konto";
      const ressource = auswahlPruefen(verbindungen, ziel, {
        anbieter: ziel.anbieter,
        art,
      });
      const schluessel = `${ziel.anbieter}:${ressource.id}`;
      if (zielSchluessel.has(schluessel)) {
        throw new Error(`Werbeziel doppelt ausgewählt: ${schluessel}`);
      }
      zielSchluessel.add(schluessel);
      return ressource;
    });
  }

  return {
    githubRepo,
    backend,
    vercelProjekt,
    ...(stripeKonto === undefined ? {} : { stripeKonto }),
    ...(searchProperty === undefined ? {} : { searchProperty }),
    ...(wixSite === undefined ? {} : { wixSite }),
    ...(higgsfieldWorkspace === undefined ? {} : { higgsfieldWorkspace }),
    werbeZiele,
  };
}
