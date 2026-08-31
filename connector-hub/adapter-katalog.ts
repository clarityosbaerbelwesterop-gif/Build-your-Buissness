import { z } from "zod";

import { offizielleQuelleFuer } from "./offizielle-quellen.js";
import {
  ConnectorAnbieter,
  Ressourcenart,
  type ConnectorAnbieter as ConnectorAnbieterTyp,
  type Ressourcenart as RessourcenartTyp,
} from "./v1.js";

export const AuthModell = z.enum([
  "github_app",
  "oauth",
  "oauth_mcp",
  "api_key",
]);
export type AuthModell = z.infer<typeof AuthModell>;

export const Schreibklasse = z.enum(["intern", "extern", "finanziell"]);
export type Schreibklasse = z.infer<typeof Schreibklasse>;

export interface ConnectorAdapterDefinition {
  readonly anbieter: ConnectorAnbieterTyp;
  readonly auth: AuthModell;
  readonly ressourcenart: RessourcenartTyp;
  readonly discovery: boolean;
  readonly schreiben: boolean;
  readonly schreibklasse: Schreibklasse;
  readonly produktStatus: "grundlage" | "adapter_bereit" | "credentials_noetig";
  readonly upstreamRepository: string;
  readonly transport: "github_app" | "https_mcp" | "https_api" | "sdk";
}

type Eingabe = Omit<ConnectorAdapterDefinition, "upstreamRepository">;

function definition(eingabe: Eingabe): ConnectorAdapterDefinition {
  const anbieter = ConnectorAnbieter.parse(eingabe.anbieter);
  Ressourcenart.parse(eingabe.ressourcenart);
  AuthModell.parse(eingabe.auth);
  Schreibklasse.parse(eingabe.schreibklasse);
  return {
    ...eingabe,
    anbieter,
    upstreamRepository: offizielleQuelleFuer(anbieter).repository,
  };
}

export const CONNECTOR_ADAPTER = [
  definition({
    anbieter: "github",
    auth: "github_app",
    ressourcenart: "repo",
    discovery: true,
    schreiben: true,
    schreibklasse: "intern",
    produktStatus: "credentials_noetig",
    transport: "github_app",
  }),
  definition({
    anbieter: "neon",
    auth: "oauth",
    ressourcenart: "datenbank_projekt",
    discovery: true,
    schreiben: true,
    schreibklasse: "intern",
    produktStatus: "grundlage",
    transport: "https_api",
  }),
  definition({
    anbieter: "supabase",
    auth: "oauth_mcp",
    ressourcenart: "datenbank_projekt",
    discovery: true,
    schreiben: true,
    schreibklasse: "intern",
    produktStatus: "credentials_noetig",
    transport: "https_mcp",
  }),
  definition({
    anbieter: "vercel",
    auth: "oauth",
    ressourcenart: "vercel_projekt",
    discovery: true,
    schreiben: true,
    schreibklasse: "extern",
    produktStatus: "credentials_noetig",
    transport: "sdk",
  }),
  definition({
    anbieter: "stripe",
    auth: "oauth",
    ressourcenart: "stripe_konto",
    discovery: true,
    schreiben: true,
    schreibklasse: "finanziell",
    produktStatus: "credentials_noetig",
    transport: "sdk",
  }),
  definition({
    anbieter: "higgsfield",
    auth: "api_key",
    ressourcenart: "higgsfield_workspace",
    discovery: false,
    schreiben: true,
    schreibklasse: "finanziell",
    produktStatus: "credentials_noetig",
    transport: "sdk",
  }),
  definition({
    anbieter: "meta_ads",
    auth: "oauth",
    ressourcenart: "meta_ads_konto",
    discovery: true,
    schreiben: true,
    schreibklasse: "finanziell",
    produktStatus: "credentials_noetig",
    transport: "sdk",
  }),
  definition({
    anbieter: "tiktok_ads",
    auth: "oauth",
    ressourcenart: "tiktok_ads_konto",
    discovery: true,
    schreiben: true,
    schreibklasse: "finanziell",
    produktStatus: "credentials_noetig",
    transport: "https_api",
  }),
  definition({
    anbieter: "youtube",
    auth: "oauth",
    ressourcenart: "youtube_kanal",
    discovery: true,
    schreiben: true,
    schreibklasse: "extern",
    produktStatus: "credentials_noetig",
    transport: "sdk",
  }),
  definition({
    anbieter: "google_search_console",
    auth: "oauth",
    ressourcenart: "search_console_property",
    discovery: true,
    schreiben: true,
    schreibklasse: "extern",
    produktStatus: "credentials_noetig",
    transport: "sdk",
  }),
  definition({
    anbieter: "google_ads",
    auth: "oauth_mcp",
    ressourcenart: "google_ads_konto",
    discovery: true,
    schreiben: true,
    schreibklasse: "finanziell",
    produktStatus: "credentials_noetig",
    transport: "https_mcp",
  }),
  definition({
    anbieter: "wix",
    auth: "oauth_mcp",
    ressourcenart: "wix_site",
    discovery: true,
    schreiben: true,
    schreibklasse: "extern",
    produktStatus: "credentials_noetig",
    transport: "https_mcp",
  }),
] as const satisfies readonly ConnectorAdapterDefinition[];

const ADAPTER_NACH_ANBIETER = new Map<ConnectorAnbieterTyp, ConnectorAdapterDefinition>(
  CONNECTOR_ADAPTER.map((adapter) => [adapter.anbieter, adapter]),
);

export function adapterFuer(anbieter: ConnectorAnbieterTyp): ConnectorAdapterDefinition {
  const adapter = ADAPTER_NACH_ANBIETER.get(ConnectorAnbieter.parse(anbieter));
  if (adapter === undefined) throw new Error(`Kein Connector-Adapter definiert: ${anbieter}`);
  return adapter;
}
