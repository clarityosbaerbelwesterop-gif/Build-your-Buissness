import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./auth.js";

const ORIGIN = "https://build-your-buissness.vercel.app";
const AUTH_BASIS = "https://auth.example.invalid/neondb/auth";

function anfrage(
  pfad: string,
  init?: RequestInit,
): Request {
  return new Request(`${ORIGIN}${pfad}`, init);
}

describe("BYB Auth-Proxy", () => {
  beforeEach(() => {
    process.env["BYB_PUBLIC_ORIGIN"] = ORIGIN;
    process.env["NEON_AUTH_BASE_URL"] = AUTH_BASIS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["BYB_PUBLIC_ORIGIN"];
    delete process.env["NEON_AUTH_BASE_URL"];
  });

  it("ist kein beliebiger Open Proxy", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const antwort = await GET(anfrage("/api/auth?aktion=https://example.com"));

    expect(antwort.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bindet jede erlaubte Aktion an ihre HTTP-Methode", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const antwort = await POST(anfrage("/api/auth?aktion=token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));

    expect(antwort.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lehnt eine fremde Browser-Origin vor dem Upstream ab", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const antwort = await POST(anfrage("/api/auth?aktion=anmelden", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://fremd.example",
      },
      body: JSON.stringify({ email: "a@example.com", password: "12345678" }),
    }));

    expect(antwort.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leitet nur den festen Neon-Pfad weiter und hält die Session first-party", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${AUTH_BASIS}/sign-in/email`);
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("origin")).toBe(ORIGIN);
      return new Response(JSON.stringify({ user: { email: "a@example.com" } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "__Secure-neonauth.session_token=opaque; Domain=auth.example.invalid; Path=/; HttpOnly; Secure; SameSite=None",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const antwort = await POST(anfrage("/api/auth?aktion=anmelden", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
      },
      body: JSON.stringify({ email: "a@example.com", password: "12345678" }),
    }));

    expect(antwort.status).toBe(200);
    const cookie = antwort.headers.get("set-cookie");
    expect(cookie).toContain("Path=/api/auth");
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("gibt das bestehende Session-Cookie nur an den Token-Endpunkt weiter", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`${AUTH_BASIS}/token`);
      expect(new Headers(init?.headers).get("cookie")).toBe("session=opaque");
      return Response.json({ token: "jwt-aus-neon" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const antwort = await GET(anfrage("/api/auth?aktion=token", {
      headers: { cookie: "session=opaque" },
    }));

    expect(antwort.status).toBe(200);
    await expect(antwort.json()).resolves.toEqual({ token: "jwt-aus-neon" });
  });
});
