import { optional, pflicht } from "../config/umgebung.js";

type AuthAktion = "anmelden" | "abmelden" | "registrieren" | "sitzung" | "token";
type Methode = "GET" | "POST";

interface AuthRegel {
  readonly methode: Methode;
  readonly pfad: string;
}

const AUTH_REGELN = {
  anmelden: { methode: "POST", pfad: "/sign-in/email" },
  abmelden: { methode: "POST", pfad: "/sign-out" },
  registrieren: { methode: "POST", pfad: "/sign-up/email" },
  sitzung: { methode: "GET", pfad: "/get-session" },
  token: { methode: "GET", pfad: "/token" },
} as const satisfies Record<AuthAktion, AuthRegel>;

function json(daten: unknown, status: number): Response {
  return Response.json(daten, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function aktionsRegel(request: Request, methode: Methode): AuthRegel | undefined {
  const roh = new URL(request.url).searchParams.get("aktion");
  if (roh === null || !(roh in AUTH_REGELN)) return undefined;
  const regel = AUTH_REGELN[roh as AuthAktion];
  return regel.methode === methode ? regel : undefined;
}

function oeffentlicheOrigin(): string {
  const roh = optional(
    "BYB_PUBLIC_ORIGIN",
    "https://build-your-buissness.vercel.app",
  );
  const url = new URL(roh);
  if (url.protocol !== "https:" || url.origin !== roh.replace(/\/$/, "")) {
    throw new Error("BYB_PUBLIC_ORIGIN muss ein HTTPS-Origin ohne Pfad sein.");
  }
  return url.origin;
}

function requestIstFuerOrigin(request: Request, origin: string): boolean {
  if (new URL(request.url).origin !== origin) return false;
  const browserOrigin = request.headers.get("origin");
  return browserOrigin === null || browserOrigin === origin;
}

function cookieFuerByb(cookie: string): string {
  const teile = cookie
    .split(";")
    .map((teil) => teil.trim())
    .filter((teil) => !/^domain=/i.test(teil) && !/^path=/i.test(teil));
  return [...teile, "Path=/api/auth"].join("; ");
}

function upstreamCookies(headers: Headers): readonly string[] {
  const erweitert = headers as Headers & { getSetCookie?: () => string[] };
  const mehrfach = erweitert.getSetCookie?.();
  if (mehrfach !== undefined && mehrfach.length > 0) return mehrfach;
  const einzeln = headers.get("set-cookie");
  return einzeln === null ? [] : [einzeln];
}

async function weiterleiten(request: Request, methode: Methode): Promise<Response> {
  try {
    const regel = aktionsRegel(request, methode);
    if (regel === undefined) return json({ fehler: "AUTH_AKTION_NICHT_ERLAUBT" }, 405);

    const origin = oeffentlicheOrigin();
    if (!requestIstFuerOrigin(request, origin)) {
      return json({ fehler: "AUTH_ORIGIN_ABGELEHNT" }, 403);
    }

    const basis = pflicht("NEON_AUTH_BASE_URL", "Neon Auth weiterleiten").replace(/\/$/, "");
    const headers = new Headers({ accept: "application/json", origin });
    const cookie = request.headers.get("cookie");
    if (cookie !== null) headers.set("cookie", cookie);

    let body: string | undefined;
    if (methode === "POST") {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().startsWith("application/json")) {
        return json({ fehler: "AUTH_JSON_ERWARTET" }, 415);
      }
      headers.set("content-type", "application/json");
      body = await request.text();
      if (body.length > 16_384) return json({ fehler: "AUTH_ANFRAGE_ZU_GROSS" }, 413);
    }

    const init: RequestInit = {
      method: methode,
      headers,
      redirect: "manual",
    };
    if (body !== undefined) init.body = body;

    const upstream = await fetch(`${basis}${regel.pfad}`, init);

    const antwortHeaders = new Headers({ "cache-control": "no-store" });
    const antwortTyp = upstream.headers.get("content-type");
    if (antwortTyp !== null) antwortHeaders.set("content-type", antwortTyp);
    for (const setCookie of upstreamCookies(upstream.headers)) {
      antwortHeaders.append("set-cookie", cookieFuerByb(setCookie));
    }

    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: antwortHeaders,
    });
  } catch {
    return json({ fehler: "AUTH_NICHT_VERFUEGBAR" }, 503);
  }
}

export function GET(request: Request): Promise<Response> {
  return weiterleiten(request, "GET");
}

export function POST(request: Request): Promise<Response> {
  return weiterleiten(request, "POST");
}
