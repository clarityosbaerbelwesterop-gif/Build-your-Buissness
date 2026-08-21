/**
 * Angreifer: Route Handler mit Datenbankzugriff ohne Prüfung, wer da fragt.
 *
 * Der Fund: eine Route liest oder schreibt in der Datenbank, ohne vorher die
 * Sitzung zu prüfen. Wer die Adresse kennt, kommt an die Daten — ohne Konto,
 * ohne Anmeldung.
 *
 * Warum das trotz RLS ein eigener Fund ist: Row Level Security schützt anhand
 * der **Kennung des angemeldeten Nutzers**. Gibt es keine Anmeldung, gibt es
 * keine Kennung, und die Regel greift ins Leere oder gibt alles frei. Die
 * beiden Prüfungen decken verschiedene Löcher — wer nur eine hat, hat keine.
 *
 * Was dieser Angreifer **nicht** kann: er sieht nur den Quelltext. Eine
 * Anmeldeprüfung, die es gibt, aber falsch ist — etwa eine, die den
 * Sitzungsschlüssel nicht prüft —, findet er nicht. Dafür braucht es die
 * Sandbox aus M1. Das steht in STATUS.md unter den offenen Punkten, damit
 * niemand diese Prüfung für mehr hält, als sie ist.
 */

import type { Angreifer, Datei, RoherBefund, Ziel } from "../core/schnittstellen.js";

/**
 * Wo Route Handler liegen.
 *
 * Next.js App Router (`app/**‍/route.ts`), Pages Router (`pages/api/**`) und
 * die verbreitete `api/`-Ablage. Enger als „jede Datei mit einer DB-Abfrage":
 * eine Hilfsfunktion in `lib/` ist kein Einstiegspunkt von außen.
 */
const ROUTE = /(^|\/)(app\/.*\/route\.[jt]s|pages\/api\/.*\.[jt]s|api\/.*\.[jt]s)$/i;

/** Zugriff auf die Datenbank. */
const DB_ZUGRIFF =
  /\b(db|prisma|sql|pool|client|supabase|drizzle)\s*[.(]|\bselect\s+.*\bfrom\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b/i;

/**
 * Anzeichen, dass geprüft wird, wer da fragt.
 *
 * Bewusst breit: ein falscher Negativfund (Prüfung übersehen, Route gemeldet)
 * kostet den Nutzer Vertrauen in den Bericht. Lieber eine echte Lücke nicht
 * melden, als drei saubere Routen anzuschwärzen — der Bericht wird sonst
 * überblättert, und dann nützt auch der echte Fund nichts.
 */
const AUTH_PRUEFUNG =
  /\b(getSession|auth\(\)|getServerSession|requireUser|requireAuth|currentUser|getUser|verifyToken|jwtVerify|clerkClient|withAuth|session\?*\.\w|userId)\b/i;

/** Routen, die absichtlich offen sind. */
const ABSICHTLICH_OFFEN =
  /(^|\/)(app|pages|src)?\/?(api\/)?(health|status|ping|webhook|webhooks|stripe|robots|sitemap)([./]|$)/i;

function zeileVon(inhalt: string, treffer: number): number {
  return inhalt.slice(0, treffer).split("\n").length;
}

export const routeOhneAuth: Angreifer = {
  klasse: "route-ohne-auth-pruefung",
  kategorie: "authentifizierung",
  brauchtLaufzeit: false,
  angreifen: (ziel: Ziel) => Promise.resolve(pruefen(ziel)),
};

function pruefen(ziel: Ziel): RoherBefund[] {
  const funde: RoherBefund[] = [];
  for (const datei of ziel.dateien) {
    if (!ROUTE.test(datei.pfad)) continue;
    if (ABSICHTLICH_OFFEN.test(datei.pfad)) continue;

    const zugriff = DB_ZUGRIFF.exec(datei.inhalt);
    if (zugriff === null) continue;
    if (AUTH_PRUEFUNG.test(datei.inhalt)) continue;

    funde.push({
      schweregrad: "kritisch",
      klartext:
        `Diese Adresse greift auf die Datenbank zu, ohne zu prüfen, wer sie aufruft. `
        + `Wer die Adresse kennt, kommt an die Daten — ohne Konto und ohne Anmeldung.`,
      nachweis: nachweisFuer(datei, zeileVon(datei.inhalt, zugriff.index)),
    });
  }
  return funde;
}

function nachweisFuer(datei: Datei, zeile: number): string {
  return `${datei.pfad}:${zeile}  Datenbankzugriff ohne erkennbare Sitzungsprüfung`;
}
