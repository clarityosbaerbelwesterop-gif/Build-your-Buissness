import { z } from "zod";

import { ConnectorAnbieter, type ConnectorAnbieter as ConnectorAnbieterTyp } from "./v1.js";

export const Integrationsweg = z.enum([
  "github_app",
  "remote_mcp",
  "rest_api",
  "offizielles_sdk",
]);
export type Integrationsweg = z.infer<typeof Integrationsweg>;

const Quelle = z.object({
  anbieter: ConnectorAnbieter,
  hersteller: z.string().min(1).max(100),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  weg: Integrationsweg,
  paket: z.string().min(1).max(120).optional(),
  upstreamVersion: z.string().min(1).max(50).optional(),
  remoteMcp: z.string().url().optional(),
  hinweis: z.string().min(3).max(500),
}).strict();
export type OffizielleConnectorQuelle = z.infer<typeof Quelle>;

/**
 * Ausschließlich Repositories der jeweiligen Hersteller/Produktorganisationen.
 * Community-MCPs werden nicht als Lieferkettenquelle für BYB akzeptiert.
 *
 * Die Versionen dokumentieren den bei der M1.8-Recherche verifizierten
 * Upstream-Stand. Sie sind keine automatische Update-Freigabe.
 */
export const OFFIZIELLE_CONNECTOR_QUELLEN = [
  {
    anbieter: "github",
    hersteller: "GitHub",
    repository: "github/github-mcp-server",
    weg: "github_app",
    remoteMcp: "https://api.githubcopilot.com/mcp/",
    hinweis: "BYB nutzt für Produktzugriff eine eigene GitHub App mit Installations- und Repo-Scope. Der offizielle Remote-MCP ist eine optionale Ausführungsschicht, nicht der Credential-Store.",
  },
  {
    anbieter: "neon",
    hersteller: "Neon",
    repository: "neondatabase/mcp-server-neon",
    weg: "rest_api",
    remoteMcp: "https://mcp.neon.tech/mcp",
    hinweis: "Der offizielle Neon-MCP warnt selbst vor Production-Einsatz. BYB nutzt in Production die Neon API mit Resource-Picks; MCP bleibt Entwicklungs-/Assistenzquelle.",
  },
  {
    anbieter: "supabase",
    hersteller: "Supabase",
    repository: "supabase/mcp",
    weg: "remote_mcp",
    paket: "@supabase/mcp-server-supabase",
    remoteMcp: "https://mcp.supabase.com/mcp",
    hinweis: "Offizieller OAuth-fähiger MCP. BYB muss ihn pro ausgewähltem Projekt und mit minimalen Feature-/Write-Rechten scopen.",
  },
  {
    anbieter: "vercel",
    hersteller: "Vercel",
    repository: "vercel/sdk",
    weg: "offizielles_sdk",
    paket: "@vercel/sdk",
    upstreamVersion: "1.28.22",
    hinweis: "Offizielles TypeScript-SDK. Externe Deploy-/Domain-Aktionen bleiben an BYB-Freigaben gebunden.",
  },
  {
    anbieter: "stripe",
    hersteller: "Stripe",
    repository: "stripe/stripe-node",
    weg: "offizielles_sdk",
    paket: "stripe",
    upstreamVersion: "22.5.0",
    hinweis: "Offizielles Node-SDK. BYB hält den eigenen Produkt-Namespace und die bestehende Price-Allowlist als zusätzliche Grenze.",
  },
  {
    anbieter: "higgsfield",
    hersteller: "Higgsfield",
    repository: "higgsfield-ai/higgsfield-js",
    weg: "offizielles_sdk",
    paket: "@higgsfield/client",
    upstreamVersion: "0.2.1",
    hinweis: "Offizielles serverseitiges TypeScript-SDK für Bild-/Videogenerierung. Community-MCP-Repositories werden nicht übernommen.",
  },
  {
    anbieter: "meta_ads",
    hersteller: "Meta",
    repository: "facebook/facebook-nodejs-business-sdk",
    weg: "offizielles_sdk",
    paket: "facebook-nodejs-business-sdk",
    upstreamVersion: "26.0.1",
    hinweis: "Offizielles Marketing-API-SDK. Kampagnen-/Budgetwrites bleiben finanziell freigabepflichtig.",
  },
  {
    anbieter: "tiktok_ads",
    hersteller: "TikTok",
    repository: "tiktok/tiktok-business-api-sdk",
    weg: "rest_api",
    hinweis: "Offizielles Business-API-SDK enthält einen JS-Client. BYB implementiert gegen die dokumentierte v1.3-REST-Grenze statt den generierten Client ungeprüft zu vendoren.",
  },
  {
    anbieter: "youtube",
    hersteller: "Google",
    repository: "googleapis/google-api-nodejs-client",
    weg: "offizielles_sdk",
    paket: "googleapis",
    upstreamVersion: "176.0.0",
    hinweis: "Offizieller Google-API-Client deckt YouTube Data API und OAuth ab. Kanalwahl wird als Resource-Pick persistiert.",
  },
  {
    anbieter: "google_search_console",
    hersteller: "Google",
    repository: "googleapis/google-api-nodejs-client",
    weg: "offizielles_sdk",
    paket: "googleapis",
    upstreamVersion: "176.0.0",
    hinweis: "Search Console läuft über denselben offiziellen Google-API-Client, aber mit getrennten Scopes und Property-Picks.",
  },
  {
    anbieter: "google_ads",
    hersteller: "Google Ads",
    repository: "googleads/google-ads-mcp",
    weg: "remote_mcp",
    hinweis: "Offizieller Google-Ads-MCP unterstützt OAuth-Proxy und Account-Discovery. Budget-/Campaign-Writes bleiben finanziell freigabepflichtig.",
  },
  {
    anbieter: "wix",
    hersteller: "Wix",
    repository: "wix/wix-mcp",
    weg: "remote_mcp",
    remoteMcp: "https://mcp.wix.com/mcp",
    hinweis: "Offizieller Wix-MCP kann Sites listen und Site-APIs aufrufen. Wix bleibt BYB-internes Design-/Landingpage-Werkzeug, nicht Runtime-Abhängigkeit des Kernprodukts.",
  },
] as const satisfies readonly OffizielleConnectorQuelle[];

const NACH_ANBIETER = new Map<ConnectorAnbieterTyp, OffizielleConnectorQuelle>(
  OFFIZIELLE_CONNECTOR_QUELLEN.map((quelle) => [quelle.anbieter, Quelle.parse(quelle)]),
);

export function offizielleQuelleFuer(anbieter: ConnectorAnbieterTyp): OffizielleConnectorQuelle {
  const quelle = NACH_ANBIETER.get(ConnectorAnbieter.parse(anbieter));
  if (quelle === undefined) throw new Error(`Keine offizielle Connector-Quelle hinterlegt: ${anbieter}`);
  return quelle;
}
