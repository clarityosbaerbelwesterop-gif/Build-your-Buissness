import { describe, expect, it } from "vitest";

import {
  ConnectorVerbindung,
  UnternehmensWerkzeuge,
  werkzeugeAufloesen,
  type ConnectorVerbindung as ConnectorVerbindungTyp,
} from "./v1.js";

function verbindung(
  id: string,
  anbieter: ConnectorVerbindungTyp["anbieter"],
  art: ConnectorVerbindungTyp["ressourcen"][number]["art"],
  ressourcenId: string,
): ConnectorVerbindungTyp {
  return ConnectorVerbindung.parse({
    version: 1,
    id,
    anbieter,
    modus: anbieter === "github" ? "oauth" : "mcp",
    konto_ref: `${anbieter}-konto`,
    status: "verbunden",
    scopes: ["read", "write"],
    ressourcen: [{ id: ressourcenId, art, name: `${anbieter} Ressource` }],
  });
}

const verbindungen = [
  verbindung("github", "github", "repo", "firma/repo"),
  verbindung("neon", "neon", "datenbank_projekt", "neon-projekt"),
  verbindung("supabase", "supabase", "datenbank_projekt", "supabase-projekt"),
  verbindung("vercel", "vercel", "vercel_projekt", "vercel-projekt"),
  verbindung("stripe", "stripe", "stripe_konto", "acct_123"),
  verbindung("higgsfield", "higgsfield", "higgsfield_workspace", "workspace-1"),
  verbindung("meta", "meta_ads", "meta_ads_konto", "meta-ads-1"),
  verbindung("tiktok", "tiktok_ads", "tiktok_ads_konto", "tiktok-ads-1"),
  verbindung("youtube", "youtube", "youtube_kanal", "youtube-1"),
  verbindung("search", "google_search_console", "search_console_property", "https://firma.de"),
  verbindung("gads", "google_ads", "google_ads_konto", "google-ads-1"),
  verbindung("wix", "wix", "wix_site", "wix-site-1"),
] as const;

function auswahl() {
  return UnternehmensWerkzeuge.parse({
    github_repo: { verbindung_id: "github", ressourcen_id: "firma/repo" },
    backend: { anbieter: "neon", verbindung_id: "neon", ressourcen_id: "neon-projekt" },
    vercel_projekt: { verbindung_id: "vercel", ressourcen_id: "vercel-projekt" },
    payments: { verbindung_id: "stripe", ressourcen_id: "acct_123" },
    indexierung: { verbindung_id: "search", ressourcen_id: "https://firma.de" },
    landingpage: { verbindung_id: "wix", ressourcen_id: "wix-site-1" },
    werbung: {
      kreativ: { verbindung_id: "higgsfield", ressourcen_id: "workspace-1" },
      ziele: [
        { anbieter: "meta_ads", verbindung_id: "meta", ressourcen_id: "meta-ads-1" },
        { anbieter: "tiktok_ads", verbindung_id: "tiktok", ressourcen_id: "tiktok-ads-1" },
        { anbieter: "youtube", verbindung_id: "youtube", ressourcen_id: "youtube-1" },
        { anbieter: "google_ads", verbindung_id: "gads", ressourcen_id: "google-ads-1" },
      ],
    },
  });
}

describe("Connector Hub v1", () => {
  it("löst Repo, Backend, Vercel, Stripe, Search, Wix, Higgsfield und Werbeziele auf", () => {
    const ergebnis = werkzeugeAufloesen(verbindungen, auswahl());

    expect(ergebnis.githubRepo.id).toBe("firma/repo");
    expect(ergebnis.backend.id).toBe("neon-projekt");
    expect(ergebnis.vercelProjekt.id).toBe("vercel-projekt");
    expect(ergebnis.stripeKonto?.id).toBe("acct_123");
    expect(ergebnis.searchProperty?.id).toBe("https://firma.de");
    expect(ergebnis.wixSite?.id).toBe("wix-site-1");
    expect(ergebnis.higgsfieldWorkspace?.id).toBe("workspace-1");
    expect(ergebnis.werbeZiele).toHaveLength(4);
  });

  it("unterstützt Supabase statt Neon als genau ausgewählten Backend-Pfad", () => {
    const basis = auswahl();
    const ergebnis = werkzeugeAufloesen(verbindungen, {
      ...basis,
      backend: {
        anbieter: "supabase",
        verbindung_id: "supabase",
        ressourcen_id: "supabase-projekt",
      },
    });

    expect(ergebnis.backend.id).toBe("supabase-projekt");
  });

  it("weist eine Ressource zurück, die nicht zur ausgewählten Verbindung gehört", () => {
    expect(() =>
      werkzeugeAufloesen(verbindungen, {
        ...auswahl(),
        github_repo: { verbindung_id: "github", ressourcen_id: "fremd/repo" },
      }),
    ).toThrow(/gehört nicht/);
  });

  it("weist den falschen Anbieter für eine Rolle zurück", () => {
    expect(() =>
      werkzeugeAufloesen(verbindungen, {
        ...auswahl(),
        vercel_projekt: { verbindung_id: "github", ressourcen_id: "firma/repo" },
      }),
    ).toThrow(/Falscher Anbieter/);
  });

  it("arbeitet nicht mit einer Verbindung, die erneut angemeldet werden muss", () => {
    const kaputt = verbindungen.map((eintrag) =>
      eintrag.id === "stripe" ? { ...eintrag, status: "erneut_anmelden" as const } : eintrag,
    );

    expect(() => werkzeugeAufloesen(kaputt, auswahl())).toThrow(/nicht arbeitsbereit/);
  });

  it("nimmt keine Tokens oder unbekannten Secret-Felder in den Hub-Vertrag auf", () => {
    expect(() =>
      ConnectorVerbindung.parse({
        ...verbindungen[0],
        access_token: "darf-nicht-persistiert-werden",
      }),
    ).toThrow();
  });

  it("weist doppelte Werbeziele zurück", () => {
    const basis = auswahl();
    expect(() =>
      werkzeugeAufloesen(verbindungen, {
        ...basis,
        werbung: {
          ...basis.werbung,
          ziele: [
            basis.werbung!.ziele[0]!,
            basis.werbung!.ziele[0]!,
          ],
        },
      }),
    ).toThrow(/doppelt/);
  });
});
