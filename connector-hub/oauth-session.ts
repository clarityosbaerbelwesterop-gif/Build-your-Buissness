import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import type { ConnectorAnbieter } from "./v1.js";
import { mitConnectorTransaktion } from "../db/connector-kontext.js";
import type { SqlVerbindung, VerifizierteIdentitaet } from "../db/auth-kontext.js";

const State = z.string().min(32).max(300).regex(/^[A-Za-z0-9_-]+$/);
const InstallationId = z.number().int().positive().safe();
const SessionZeile = z.object({
  phase: z.enum(["gestartet", "autorisiert"]),
  erlaubte_installationen: z.unknown(),
});

export interface OAuthSession {
  readonly state: string;
  readonly phase: "gestartet" | "autorisiert";
  readonly erlaubteInstallationen: readonly number[];
}

function stateHash(state: string): string {
  return createHash("sha256").update(State.parse(state), "utf8").digest("hex");
}

function installationenAus(roh: unknown): number[] {
  return z.array(InstallationId).max(100).parse(roh);
}

export async function oauthSessionStarten(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  anbieter: ConnectorAnbieter,
  lebensdauerMs = 15 * 60 * 1000,
  jetzt = Date.now(),
): Promise<OAuthSession> {
  const dauer = z.number().int().min(60_000).max(60 * 60 * 1000).parse(lebensdauerMs);
  const state = randomBytes(32).toString("base64url");
  const laeuftAb = new Date(jetzt + dauer);

  await mitConnectorTransaktion(verbindung, identitaet, async (db) => {
    await db.query(
      `insert into connector_oauth_sessions
         (state_hash, nutzer_id, anbieter, phase, laeuft_ab)
       values ($1, $2, $3, 'gestartet', $4)`,
      [stateHash(state), identitaet.nutzerId, anbieter, laeuftAb],
    );
  });
  return { state, phase: "gestartet", erlaubteInstallationen: [] };
}

export async function oauthSessionAutorisieren(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  stateRoh: string,
  installationenRoh: readonly number[],
): Promise<OAuthSession> {
  const state = State.parse(stateRoh);
  const installationen = z.array(InstallationId).min(1).max(100).parse(installationenRoh);

  return mitConnectorTransaktion(verbindung, identitaet, async (db) => {
    const ergebnis = await db.query(
      `update connector_oauth_sessions
          set phase = 'autorisiert',
              erlaubte_installationen = $2::jsonb,
              aktualisiert = now()
        where state_hash = $1
          and phase = 'gestartet'
        returning phase, erlaubte_installationen`,
      [stateHash(state), JSON.stringify(installationen)],
    );
    const roh = ergebnis.rows[0];
    if (roh === undefined) throw new Error("OAuth-State ist ungültig, abgelaufen oder bereits verwendet.");
    const zeile = SessionZeile.parse(roh);
    return {
      state,
      phase: zeile.phase,
      erlaubteInstallationen: installationenAus(zeile.erlaubte_installationen),
    };
  });
}

export async function oauthSessionVerbrauchen(
  verbindung: SqlVerbindung,
  identitaet: VerifizierteIdentitaet,
  stateRoh: string,
  installationIdRoh: number,
): Promise<void> {
  const state = State.parse(stateRoh);
  const installationId = InstallationId.parse(installationIdRoh);

  await mitConnectorTransaktion(verbindung, identitaet, async (db) => {
    const ergebnis = await db.query(
      `delete from connector_oauth_sessions
        where state_hash = $1
          and phase = 'autorisiert'
          and erlaubte_installationen @> $2::jsonb
        returning state_hash`,
      [stateHash(state), JSON.stringify([installationId])],
    );
    if (ergebnis.rows.length !== 1) {
      throw new Error("OAuth-Auswahl gehört nicht zur autorisierten Sitzung.");
    }
  });
}
