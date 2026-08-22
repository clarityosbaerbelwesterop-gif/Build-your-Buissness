import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod";

import { optional, pflicht } from "../config/umgebung.js";
import {
  identitaetNachVerifikation,
  type VerifizierteIdentitaet,
} from "../db/auth-kontext.js";

function nurHttps(wert: string): boolean {
  const url = new URL(wert);
  return url.protocol === "https:"
    && url.username.length === 0
    && url.password.length === 0
    && url.hash.length === 0;
}

const HttpsUrl = z.string().trim().url().refine(nurHttps, {
  message: "Auth-Endpunkte müssen HTTPS verwenden und dürfen keine Zugangsdaten oder Fragmente enthalten.",
});

const Konfiguration = z.object({
  jwksUrl: HttpsUrl,
  issuer: HttpsUrl,
  audience: z.string().trim().min(1).max(500),
});

const Token = z.string().trim().min(20).max(16_384);

export type NeonJwtKonfiguration = z.infer<typeof Konfiguration>;
export type TokenPruefer = (token: string) => Promise<VerifizierteIdentitaet>;

type SchluesselQuelle = JWTVerifyGetKey;

/**
 * Absichtlich informationsarme Fehlermeldung an der Auth-Grenze.
 *
 * Ein abgelehntes Token wird weder zurückgegeben noch in eine Fehlermeldung
 * eingebaut. Die konkrete JOSE-Ursache ist für die Entscheidung 401/403 nicht
 * erforderlich und gehört nicht in Anwendungsprotokolle.
 */
export class AuthTokenFehler extends Error {
  constructor() {
    super("Authentifizierungstoken wurde abgelehnt.");
    this.name = "AuthTokenFehler";
  }
}

/**
 * Managed Neon Auth stellt die API unter einem Pfad wie `/neondb/auth` bereit,
 * setzt `iss` und `aud` im ausgestellten JWT aber auf den HTTPS-Origin des
 * Endpunkts. Das wurde im M0.7-Livenachweis gegen einen isolierten Neon-Zweig
 * beobachtet und ist deshalb hier die Vorgabe statt einer geratenen Pfadregel.
 *
 * Beide Werte bleiben explizit überschreibbar. Damit kann eine spätere
 * Provider-Konfiguration enger werden, ohne diese Verifikationslogik zu ändern.
 * JWKS und Basis-URL sind öffentliche Konfiguration, keine Geheimnisse.
 */
export function neonJwtKonfigurationAusUmgebung(
  umgebung: Record<string, string | undefined> = process.env,
): NeonJwtKonfiguration {
  const basis = HttpsUrl.parse(
    pflicht("NEON_AUTH_BASE_URL", "Neon-Auth-Token prüfen", umgebung),
  );
  const origin = new URL(basis).origin;
  return Konfiguration.parse({
    jwksUrl: pflicht("NEON_AUTH_JWKS_URL", "Neon-Auth-Token prüfen", umgebung),
    issuer: optional("NEON_AUTH_ISSUER", origin, umgebung),
    audience: optional("NEON_AUTH_AUDIENCE", origin, umgebung),
  });
}

/** Nur ein einzelnes Bearer-Token akzeptieren; keine Cookies oder Mischformen. */
export function bearerTokenAus(authorization: string | undefined): string {
  if (authorization === undefined) throw new AuthTokenFehler();
  const treffer = /^Bearer[\t ]+(\S+)$/i.exec(authorization.trim());
  const token = treffer?.[1];
  if (token === undefined) throw new AuthTokenFehler();
  try {
    return Token.parse(token);
  } catch {
    throw new AuthTokenFehler();
  }
}

/**
 * Erzeugt einen Prüfer, der die JWKS-Quelle einmal anlegt und dadurch deren
 * Cache über mehrere Requests wiederverwendet.
 *
 * Für Neon Auth wird EdDSA/Ed25519 fest zugelassen. Ein Angreifer kann damit
 * nicht über den JWT-Header auf einen anderen Signaturalgorithmus ausweichen.
 * `jwtVerify` prüft zusätzlich Ablaufzeit und, falls vorhanden, `nbf`.
 */
export function neonJwtPruefer(
  eingabe: NeonJwtKonfiguration,
  schluesselQuelle?: SchluesselQuelle,
): TokenPruefer {
  const konfiguration = Konfiguration.parse(eingabe);
  const quelle = schluesselQuelle ?? createRemoteJWKSet(new URL(konfiguration.jwksUrl));

  return async (tokenEingabe: string): Promise<VerifizierteIdentitaet> => {
    try {
      const token = Token.parse(tokenEingabe);
      const { payload } = await jwtVerify(token, quelle, {
        issuer: konfiguration.issuer,
        audience: konfiguration.audience,
        algorithms: ["EdDSA"],
        requiredClaims: ["sub", "iss", "aud", "exp"],
        clockTolerance: 5,
      });
      if (typeof payload.sub !== "string") throw new AuthTokenFehler();
      return identitaetNachVerifikation(payload.sub);
    } catch (fehler) {
      if (fehler instanceof AuthTokenFehler) throw fehler;
      throw new AuthTokenFehler();
    }
  };
}
