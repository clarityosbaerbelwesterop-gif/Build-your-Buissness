import { Client } from "pg";
import { z } from "zod";

import { bearerTokenAus, neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "../auth/neon-jwt.js";
import {
  githubAppKonfigurationAusUmgebung,
  githubInstallationRepos,
  githubInstallationsUrl,
} from "../connector-hub/github-app.js";
import { githubInstallationPruefen } from "../connector-hub/github-installation.js";
import {
  oauthSessionAutorisieren,
  oauthSessionStarten,
  oauthSessionVerbrauchen,
} from "../connector-hub/oauth-session.js";
import { verbindungSpeichern } from "../connector-hub/speicher.js";
import { zugang } from "../config/zugaenge.js";
import type { SqlVerbindung, VerifizierteIdentitaet } from "../db/auth-kontext.js";

const Aktion = z.enum(["start", "entdecken", "speichern"]);
const Entdecken = z.object({
  state: z.string().min(32).max(300),
  installationId: z.number().int().positive().safe(),
}).strict();
const Speichern = Entdecken.extend({
  repoId: z.number().int().positive().safe(),
}).strict();

function json(daten: unknown, status = 200): Response {
  return Response.json(daten, { status, headers: { "cache-control": "no-store" } });
}

async function identitaetAus(request: Request): Promise<VerifizierteIdentitaet> {
  const token = bearerTokenAus(request.headers.get("authorization") ?? undefined);
  return neonJwtPruefer(neonJwtKonfigurationAusUmgebung())(token);
}

async function mitDatenbank<T>(arbeit: (db: SqlVerbindung) => Promise<T>): Promise<T> {
  const klient = new Client({
    connectionString: zugang("datenbankUrl"),
    ssl: { rejectUnauthorized: true },
  });
  await klient.connect();
  try {
    const db: SqlVerbindung = {
      query: async (sql, werte) => {
        const ergebnis = await klient.query<Record<string, unknown>>(sql, werte);
        return { rows: ergebnis.rows };
      },
    };
    return await arbeit(db);
  } finally {
    await klient.end();
  }
}

export async function POST(request: Request): Promise<Response> {
  let identitaet: VerifizierteIdentitaet;
  try {
    identitaet = await identitaetAus(request);
  } catch {
    return json({ fehler: "NICHT_AUTORISIERT" }, 401);
  }

  let aktion: z.infer<typeof Aktion>;
  try {
    aktion = Aktion.parse(new URL(request.url).searchParams.get("aktion"));
  } catch {
    return json({ fehler: "GITHUB_AKTION_UNGUELTIG" }, 400);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ fehler: "JSON_ERWARTET" }, 415);
  }

  try {
    const konfiguration = githubAppKonfigurationAusUmgebung();
    if (aktion === "start") {
      const session = await mitDatenbank((db) => oauthSessionStarten(db, identitaet, "github"));
      return json({
        state: session.state,
        installationsUrl: githubInstallationsUrl(konfiguration.appSlug, session.state),
      });
    }

    const roh: unknown = await request.json();
    if (aktion === "entdecken") {
      const eingabe = Entdecken.parse(roh);
      const installation = await githubInstallationPruefen(konfiguration, eingabe.installationId);
      const repos = await githubInstallationRepos(konfiguration, eingabe.installationId);
      await mitDatenbank((db) =>
        oauthSessionAutorisieren(db, identitaet, eingabe.state, [eingabe.installationId]),
      );
      return json({ installation: { id: installation.id, konto: installation.konto }, repos });
    }

    const eingabe = Speichern.parse(roh);
    const installation = await githubInstallationPruefen(konfiguration, eingabe.installationId);
    const repos = await githubInstallationRepos(konfiguration, eingabe.installationId);
    const repo = repos.find((eintrag) => eintrag.id === eingabe.repoId);
    if (repo === undefined) return json({ fehler: "GITHUB_REPO_NICHT_FREIGEGEBEN" }, 403);

    await mitDatenbank(async (db) => {
      await oauthSessionVerbrauchen(db, identitaet, eingabe.state, eingabe.installationId);
      await verbindungSpeichern(db, identitaet, {
        version: 1,
        id: `github-${eingabe.installationId}`,
        anbieter: "github",
        modus: "oauth",
        konto_ref: installation.konto,
        status: "verbunden",
        scopes: ["contents:write", "pull_requests:write"],
        ressourcen: [{ id: String(repo.id), art: "repo", name: repo.name }],
      });
    });
    return json({
      verbindung: {
        anbieter: "github",
        konto: installation.konto,
        repo: { id: repo.id, name: repo.name, privat: repo.privat },
      },
    }, 201);
  } catch (fehler) {
    if (fehler instanceof z.ZodError || fehler instanceof SyntaxError) {
      return json({ fehler: "GITHUB_EINGABE_UNGUELTIG" }, 400);
    }
    return json({ fehler: "GITHUB_CONNECT_NICHT_VERFUEGBAR" }, 503);
  }
}
