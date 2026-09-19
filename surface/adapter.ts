import { z } from "zod";

import { gesetzt } from "../config/umgebung.js";

export type AdapterStatus = "verbunden" | "nicht_verbunden" | "unerreichbar";

export interface AdapterAntwort {
  readonly status: AdapterStatus;
  readonly hinweis: string;
  readonly referenz?: string;
}

export type AdapterFetch = (
  url: string,
  init?: {
    readonly method?: string;
    readonly headers?: Record<string, string>;
    readonly body?: string;
    readonly signal?: AbortSignal;
  },
) => Promise<Response>;

export interface AdapterAufruf {
  readonly idee: string;
  readonly auftragId: string;
  readonly aktionId: string;
  readonly umgebung?: Record<string, string | undefined>;
  readonly fetchImpl?: AdapterFetch;
  readonly timeoutMs?: number;
}

const HttpsOrigin = z.string().trim().url().refine((wert) => {
  const url = new URL(wert);
  return url.protocol === "https:"
    && url.username.length === 0
    && url.password.length === 0
    && url.hash.length === 0
    && url.origin === wert.replace(/\/$/, "");
}, { message: "Adapter-URLs müssen ein HTTPS-Origin ohne Pfad sein." });

const DEFAULT_TIMEOUT_MS = 8_000;

function basisUrl(
  namen: readonly string[],
  umgebung: Record<string, string | undefined>,
): string | undefined {
  for (const name of namen) {
    const roh = gesetzt(name, umgebung);
    if (roh === undefined) continue;
    const gelesen = HttpsOrigin.safeParse(roh.replace(/\/+$/, ""));
    if (gelesen.success) return gelesen.data;
  }
  return undefined;
}

async function postJson(
  url: string,
  koerper: unknown,
  optionen: {
    readonly fetchImpl?: AdapterFetch;
    readonly timeoutMs?: number;
  },
): Promise<{ readonly ok: boolean; readonly status: number; readonly text: string }> {
  const hole = optionen.fetchImpl ?? fetch;
  const antwort = await hole(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(koerper),
    signal: AbortSignal.timeout(optionen.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  const text = await antwort.text();
  return { ok: antwort.ok, status: antwort.status, text: text.slice(0, 400) };
}

function antwortMitReferenz(
  status: AdapterAntwort["status"],
  hinweis: string,
  referenz: string | undefined,
): AdapterAntwort {
  if (referenz === undefined) return { status, hinweis };
  return { status, hinweis, referenz };
}

function referenzAus(text: string): string | undefined {
  try {
    const roh = JSON.parse(text) as { id?: unknown; runId?: unknown };
    if (typeof roh.id === "string" && roh.id.length > 0 && roh.id.length <= 180) return roh.id;
    if (typeof roh.runId === "string" && roh.runId.length > 0 && roh.runId.length <= 180) {
      return roh.runId;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function studioKnotenAufrufen(aufruf: AdapterAufruf): Promise<AdapterAntwort> {
  const umgebung = aufruf.umgebung ?? process.env;
  const basis = basisUrl(["STUDIO_BASE_URL"], umgebung);
  if (basis === undefined) {
    return {
      status: "nicht_verbunden",
      hinweis: "Die Angebotsseite bleibt eine BYB-Vorschau. Veröffentlichung über verbundene Systeme steht noch aus.",
    };
  }

  try {
    const antwort = await postJson(
      `${basis}/api/studio/runs`,
      { brief: aufruf.idee, auftragId: aufruf.auftragId },
      aufruf,
    );
    if (!antwort.ok) {
      return {
        status: "unerreichbar",
        hinweis: "Die verbundene Angebots-Erzeugung hat nicht angenommen. Die BYB-Vorschau bleibt sichtbar.",
      };
    }
    return antwortMitReferenz(
      "verbunden",
      "Die Angebots-Erzeugung hat den Auftrag angenommen. Die Vorschau bleibt in BYB.",
      referenzAus(antwort.text),
    );
  } catch {
    return {
      status: "unerreichbar",
      hinweis: "Die verbundene Angebots-Erzeugung hat nicht geantwortet. Die BYB-Vorschau bleibt sichtbar.",
    };
  }
}

export async function agentStarten(aufruf: AdapterAufruf): Promise<AdapterAntwort> {
  const umgebung = aufruf.umgebung ?? process.env;
  const basis = basisUrl(["ZEUS_BASE_URL", "AGENT_BASE_URL"], umgebung);
  if (basis === undefined) {
    return {
      status: "nicht_verbunden",
      hinweis: "Kein Agent verbunden. Die Anfragen bleiben in BYB, bis die Agenten-Laufzeit angebunden ist.",
    };
  }

  try {
    const antwort = await postJson(
      `${basis}/api/runs`,
      { goal: aufruf.idee, auftragId: aufruf.auftragId, kind: "offer" },
      aufruf,
    );
    if (!antwort.ok) {
      return {
        status: "unerreichbar",
        hinweis: "Die Agenten-Laufzeit hat den Start nicht angenommen.",
      };
    }
    return antwortMitReferenz(
      "verbunden",
      "Ein Agent läuft für diese Idee.",
      referenzAus(antwort.text),
    );
  } catch {
    return {
      status: "unerreichbar",
      hinweis: "Die Agenten-Laufzeit hat nicht geantwortet.",
    };
  }
}

export async function verbrauchMelden(aufruf: AdapterAufruf & {
  readonly credits: number;
}): Promise<AdapterAntwort> {
  const umgebung = aufruf.umgebung ?? process.env;
  const basis = basisUrl(["SCP_BASE_URL", "ODIN_SCP_URL"], umgebung);
  if (basis === undefined) {
    return {
      status: "nicht_verbunden",
      hinweis: "Verbrauch wird gemessen, sobald die Abrechnungsgrenze verbunden ist.",
    };
  }

  try {
    const antwort = await postJson(
      `${basis}/hooks/meter`,
      {
        auftragId: aufruf.auftragId,
        aktionId: aufruf.aktionId,
        credits: aufruf.credits,
      },
      aufruf,
    );
    if (!antwort.ok) {
      return {
        status: "unerreichbar",
        hinweis: "Die Abrechnungsgrenze hat den Verbrauch nicht angenommen.",
      };
    }
    return {
      status: "verbunden",
      hinweis: "Verbrauch an die Abrechnungsgrenze gemeldet.",
    };
  } catch {
    return {
      status: "unerreichbar",
      hinweis: "Die Abrechnungsgrenze hat nicht geantwortet.",
    };
  }
}
