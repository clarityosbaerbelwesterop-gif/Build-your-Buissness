import { zugang } from "../config/zugaenge.js";
import type { ConnectorVerbindung } from "../connector-hub/v1.js";
import { auftragAusZielPlanen } from "../control-plane/planer.js";
import type { Antwort } from "./nvidia.js";

const KIMI_K3 = "moonshotai/kimi-k3";

const verbindungen: ConnectorVerbindung[] = [
  {
    version: 1,
    id: "github-demo",
    anbieter: "github",
    modus: "oauth",
    konto_ref: "sandbox",
    status: "verbunden",
    scopes: ["repo"],
    ressourcen: [{ id: "sandbox/startup", art: "repo", name: "Startup Repo" }],
  },
  {
    version: 1,
    id: "neon-demo",
    anbieter: "neon",
    modus: "oauth",
    konto_ref: "sandbox",
    status: "verbunden",
    scopes: ["project"],
    ressourcen: [{ id: "sandbox-db", art: "datenbank_projekt", name: "Startup DB" }],
  },
  {
    version: 1,
    id: "vercel-demo",
    anbieter: "vercel",
    modus: "oauth",
    konto_ref: "sandbox",
    status: "verbunden",
    scopes: ["project"],
    ressourcen: [{ id: "startup-web", art: "vercel_projekt", name: "Startup Web" }],
  },
  {
    version: 1,
    id: "stripe-demo",
    anbieter: "stripe",
    modus: "oauth",
    konto_ref: "sandbox",
    status: "verbunden",
    scopes: ["checkout"],
    ressourcen: [{ id: "acct_sandbox", art: "stripe_konto", name: "Startup Billing" }],
  },
  {
    version: 1,
    id: "gsc-demo",
    anbieter: "google_search_console",
    modus: "oauth",
    konto_ref: "sandbox",
    status: "verbunden",
    scopes: ["sites"],
    ressourcen: [{ id: "https://example.invalid", art: "search_console_property", name: "Startup Search" }],
  },
  {
    version: 1,
    id: "higgsfield-demo",
    anbieter: "higgsfield",
    modus: "api_key",
    konto_ref: "sandbox",
    status: "verbunden",
    scopes: ["generate"],
    ressourcen: [{ id: "workspace-sandbox", art: "higgsfield_workspace", name: "Startup Creative" }],
  },
  {
    version: 1,
    id: "meta-demo",
    anbieter: "meta_ads",
    modus: "oauth",
    konto_ref: "sandbox",
    status: "verbunden",
    scopes: ["ads_management"],
    ressourcen: [{ id: "act_sandbox", art: "meta_ads_konto", name: "Startup Ads" }],
  },
];

async function kimiFragen(
  _rolle: "schnell",
  auftrag: { readonly system?: string; readonly prompt: string },
): Promise<Antwort> {
  const basis = zugang("nvidiaBaseUrl").replace(/\/+$/, "");
  const schluessel = zugang("nvApiKey1");
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (auftrag.system !== undefined) messages.push({ role: "system", content: auftrag.system });
  messages.push({ role: "user", content: auftrag.prompt });

  const response = await fetch(`${basis}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${schluessel}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: KIMI_K3,
      messages,
      temperature: 0.15,
      max_tokens: 5_000,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Kimi-K3-Nachweis abgelehnt (HTTP ${response.status}).`);
  }

  const daten: unknown = await response.json();
  if (typeof daten !== "object" || daten === null) {
    throw new Error("Kimi K3 lieferte keine JSON-Antwort des NVIDIA-Endpunkts.");
  }
  const objekt = daten as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const text = objekt.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Kimi K3 lieferte keinen auswertbaren Text.");
  }
  const tokensEin = typeof objekt.usage?.prompt_tokens === "number"
    ? Math.trunc(objekt.usage.prompt_tokens)
    : 0;
  const tokensAus = typeof objekt.usage?.completion_tokens === "number"
    ? Math.trunc(objekt.usage.completion_tokens)
    : 0;
  return { text, tokensEin, tokensAus, modell: KIMI_K3 };
}

const ziel = [
  "Baue für ein neues deutsches B2B-SaaS ein verkaufsfähiges MVP von null auf.",
  "Nutze das verbundene GitHub-Repo, Neon für Datenbank und Login, Stripe für ein Abo,",
  "teste und prüfe die Anwendung, bereite einen Vercel-Deploy vor, mache die Seite SEO-ready,",
  "erstelle ein Werbemittel über Higgsfield und bereite eine Meta-Kampagne vor.",
  "Keine externe Veröffentlichung und kein Budget ausgeben, bevor eine Freigabe vorliegt.",
].join(" ");

const auftrag = await auftragAusZielPlanen(
  "m18-output-sandbox",
  ziel,
  600,
  verbindungen,
  { fragenImpl: kimiFragen, idErzeugen: () => "kimi-k3-output", jetzt: () => 1_000 },
);

const typen = new Set(auftrag.aktionen.map((aktion) => aktion.typ));
const pflichtPhasen = [
  "code",
  "backend",
  "auth",
  "payments",
  "test",
  "deploy",
  "indexierung",
  "werbemittel",
  "ads",
] as const;
const fehlend = pflichtPhasen.filter((typ) => !typen.has(typ));
if (fehlend.length > 0) {
  throw new Error(`Output unvollständig; fehlende Business-Phasen: ${fehlend.join(", ")}.`);
}

const unbelegtAbgeschlossen = auftrag.aktionen.some((aktion) => aktion.zustand !== "geplant");
if (unbelegtAbgeschlossen) {
  throw new Error("Output behauptet Ausführung, obwohl der Nachweis nur Planung erlaubt.");
}

const payments = auftrag.aktionen.find((aktion) => aktion.typ === "payments");
const deploy = auftrag.aktionen.find((aktion) => aktion.typ === "deploy");
const ads = auftrag.aktionen.find((aktion) => aktion.typ === "ads");
if (payments?.freigabe.klasse !== "extern" || deploy?.freigabe.klasse !== "extern") {
  throw new Error("Output verletzt die externe Freigabegrenze für Payment/Deploy.");
}
if (ads?.freigabe.klasse !== "finanziell") {
  throw new Error("Output verletzt die finanzielle Freigabegrenze für Ads.");
}

console.error(`M1.8 Output-Nachweis: ${KIMI_K3}`);
console.error(`Plan: ${auftrag.aktionen.length} Aktionen; Typen: ${[...typen].join(", ")}`);
console.error(`Credits geschätzt: ${auftrag.aktionen.reduce((summe, aktion) => summe + aktion.credits_geschaetzt, 0)}`);
console.error("Geprüft: Kernphasen vorhanden, keine erfundene Ausführung, Freigabegrenzen erhalten.");
