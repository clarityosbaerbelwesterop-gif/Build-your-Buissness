/**
 * Jeder Angreifer mit Positiv- und Negativfall.
 *
 * Der Negativfall ist der wichtigere. Ein Angreifer, der zu viel meldet,
 * erzeugt einen Bericht voller Fehlalarme — und ein Bericht, dem niemand
 * glaubt, wird überblättert. Dann nützt auch der echte Fund nichts.
 */

import { describe, expect, it } from "vitest";

import { Befund } from "../protocol/v1.js";
import type { Angreifer, Datei, Ziel } from "../core/schnittstellen.js";
import { routeOhneAuth } from "./auth.js";
import { tabelleOhneRls } from "./rls.js";
import { zugangsdatenImQuelltext } from "./zugangsdaten.js";

const KONTEXT = { runde: 1, bisherige: [] };

function ziel(...dateien: Datei[]): Ziel {
  return { lauf_id: "l", dateien };
}

async function funde(angreifer: Angreifer, ...dateien: Datei[]) {
  return angreifer.angreifen(ziel(...dateien), KONTEXT);
}

// --------------------------------------------------------------------------- #
describe("Zugangsdaten", () => {
  it("findet einen Schlüssel im Serverquelltext", async () => {
    const f = await funde(zugangsdatenImQuelltext, {
      pfad: "lib/db.ts",
      inhalt: 'const key = "nvapi-abcdefghijklmnopqrstuvwxyz0123";',
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.schweregrad).toBe("hoch");
  });

  it("stuft denselben Fund im Browser-Bündel höher ein", async () => {
    // Im Repo liest ihn, wer Zugriff hat. Im Bündel liest ihn jeder Besucher.
    const f = await funde(zugangsdatenImQuelltext, {
      pfad: "src/api.ts",
      inhalt: 'const key = "nvapi-abcdefghijklmnopqrstuvwxyz0123";',
    });
    expect(f[0]?.schweregrad).toBe("kritisch");
    expect(f[0]?.klartext).toContain("Besucher");
  });

  it("findet einen Datenbank-Zugang mit Passwort", async () => {
    const f = await funde(zugangsdatenImQuelltext, {
      pfad: "config.ts",
      inhalt: 'export const url = "postgresql://neondb_owner:geheim@ep-x.aws.neon.tech/db";',
    });
    expect(f).toHaveLength(1);
  });

  it("meldet eine öffentliche Umgebungsvariable mit Schlüssel im Namen", async () => {
    const f = await funde(zugangsdatenImQuelltext, {
      pfad: "app/page.tsx",
      inhalt: "const k = process.env.NEXT_PUBLIC_STRIPE_SECRET;",
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.klartext).toContain("Besucher lesbar");
  });

  it("meldet gewöhnlichen Code nicht", async () => {
    const f = await funde(
      zugangsdatenImQuelltext,
      { pfad: "lib/db.ts", inhalt: "const key = process.env.NVIDIA_API_KEY;" },
      { pfad: "app/page.tsx", inhalt: "export default function Seite() { return null; }" },
      { pfad: "lib/util.ts", inhalt: "// api key laden\nconst secretName = 'NVIDIA_API_KEY';" },
    );
    expect(f).toEqual([]);
  });

  it("meldet Attrappen in Testdateien und Beispielen nicht", async () => {
    const f = await funde(
      zugangsdatenImQuelltext,
      { pfad: "lib/db.test.ts", inhalt: 'const key = "sk-testtesttesttesttesttest";' },
      { pfad: ".env.example", inhalt: "NVIDIA_API_KEY=nvapi-beispielbeispielbeispiel" },
    );
    expect(f).toEqual([]);
  });

  it("schreibt den gefundenen Schlüssel nicht in den Nachweis", async () => {
    // Der Nachweis landet im Protokoll und wird angezeigt. Den Schlüssel dort
    // zu wiederholen hieße, ihn ein zweites Mal zu veröffentlichen.
    const f = await funde(zugangsdatenImQuelltext, {
      pfad: "lib/db.ts",
      inhalt: 'const key = "nvapi-abcdefghijklmnopqrstuvwxyz0123";',
    });
    expect(f[0]?.nachweis).not.toContain("nvapi-abcdefghijklmnopqrstuvwxyz0123");
    expect(f[0]?.nachweis).toContain("lib/db.ts:1");
  });
});

// --------------------------------------------------------------------------- #
describe("Row Level Security", () => {
  const mitSpalte = `create table bestellungen (
  id uuid primary key,
  user_id text not null,
  betrag numeric
);`;

  it("findet eine Mandantentabelle ganz ohne RLS", async () => {
    const f = await funde(tabelleOhneRls, { pfad: "migrations/001.sql", inhalt: mitSpalte });
    expect(f).toHaveLength(1);
    expect(f[0]?.schweregrad).toBe("kritisch");
    expect(f[0]?.nachweis).toContain("kein ENABLE");
  });

  it("findet ENABLE ohne Policy", async () => {
    const f = await funde(tabelleOhneRls, {
      pfad: "m.sql",
      inhalt: `${mitSpalte}
alter table bestellungen enable row level security;
alter table bestellungen force row level security;`,
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.nachweis).toContain("ohne CREATE POLICY");
  });

  it("findet ENABLE ohne FORCE — den Fall, der abgesichert aussieht", async () => {
    // Der heimtückische: es steht eine Regel da, aber der Eigentümer umgeht
    // sie, und die Anwendung meldet sich fast immer als Eigentümer an.
    const f = await funde(tabelleOhneRls, {
      pfad: "m.sql",
      inhalt: `${mitSpalte}
alter table bestellungen enable row level security;
create policy nur_eigene on bestellungen for all using (user_id = current_user);`,
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.nachweis).toContain("ohne FORCE");
  });

  it("meldet eine vollständig abgesicherte Tabelle nicht", async () => {
    const f = await funde(tabelleOhneRls, {
      pfad: "m.sql",
      inhalt: `${mitSpalte}
alter table bestellungen enable row level security;
alter table bestellungen force row level security;
create policy nur_eigene on bestellungen for all using (user_id = current_user);`,
    });
    expect(f).toEqual([]);
  });

  it("meldet eine Tabelle ohne Mandantenbezug nicht", async () => {
    // Eine Preisliste gehört allen. RLS darauf zu verlangen wäre Rauschen.
    const f = await funde(tabelleOhneRls, {
      pfad: "m.sql",
      inhalt: "create table preise (id uuid primary key, name text, betrag numeric);",
    });
    expect(f).toEqual([]);
  });

  it("sieht sich nur Schemadateien an", async () => {
    const f = await funde(tabelleOhneRls, {
      pfad: "docs/anleitung.md",
      inhalt: mitSpalte,
    });
    expect(f).toEqual([]);
  });

  it("hält mehrere Tabellen in einer Datei auseinander", async () => {
    const f = await funde(tabelleOhneRls, {
      pfad: "m.sql",
      inhalt: `${mitSpalte}
create table notizen (id uuid primary key, owner_id text, text text);
alter table notizen enable row level security;
alter table notizen force row level security;
create policy p on notizen for all using (owner_id = current_user);`,
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.klartext).toContain("bestellungen");
  });
});

// --------------------------------------------------------------------------- #
describe("Auth an Route Handlern", () => {
  it("findet eine Route mit Datenbankzugriff ohne Prüfung", async () => {
    const f = await funde(routeOhneAuth, {
      pfad: "app/bestellungen/route.ts",
      inhalt: "export async function GET() { return Response.json(await db.query('select * from bestellungen')); }",
    });
    expect(f).toHaveLength(1);
    expect(f[0]?.schweregrad).toBe("kritisch");
  });

  it("meldet eine Route mit Sitzungsprüfung nicht", async () => {
    const f = await funde(routeOhneAuth, {
      pfad: "app/bestellungen/route.ts",
      inhalt: `export async function GET() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  return Response.json(await db.query('select 1'));
}`,
    });
    expect(f).toEqual([]);
  });

  it("meldet eine Route ohne Datenbankzugriff nicht", async () => {
    const f = await funde(routeOhneAuth, {
      pfad: "app/hallo/route.ts",
      inhalt: "export function GET() { return Response.json({ hallo: true }); }",
    });
    expect(f).toEqual([]);
  });

  it("meldet absichtlich offene Adressen nicht", async () => {
    const f = await funde(
      routeOhneAuth,
      { pfad: "app/api/health/route.ts", inhalt: "export async function GET(){ await db.query('select 1'); }" },
      { pfad: "app/api/webhooks/stripe/route.ts", inhalt: "export async function POST(){ await db.insert(x); }" },
    );
    expect(f).toEqual([]);
  });

  it("sieht sich nur Route Handler an, keine Hilfsfunktionen", async () => {
    const f = await funde(routeOhneAuth, {
      pfad: "lib/bestellungen.ts",
      inhalt: "export const alle = () => db.query('select * from bestellungen');",
    });
    expect(f).toEqual([]);
  });
});

// --------------------------------------------------------------------------- #
describe("Alle drei zusammen", () => {
  const ALLE = [zugangsdatenImQuelltext, tabelleOhneRls, routeOhneAuth];

  it("liefert Funde, die der Datenvertrag annimmt", async () => {
    // Die Angreifer liefern rohe Funde; der Orchestrator ergänzt ID, Runde und
    // Zeitstempel. Geprüft wird hier, dass der Rest passt — vor allem der
    // Klartext, der eine Mindestlänge hat.
    for (const angreifer of ALLE) {
      const f = await funde(
        angreifer,
        { pfad: "lib/db.ts", inhalt: 'const k = "nvapi-abcdefghijklmnopqrstuvwxyz0123";' },
        { pfad: "m.sql", inhalt: "create table t (id uuid, user_id text);" },
        { pfad: "app/x/route.ts", inhalt: "export async function GET(){ await db.query('select 1'); }" },
      );
      for (const roh of f) {
        expect(() =>
          Befund.parse({
            ...roh,
            id: "x",
            kategorie: angreifer.kategorie,
            angriffsklasse: angreifer.klasse,
            zustand: "gefunden",
            runde: 1,
            zeitstempel: 1,
          }),
        ).not.toThrow();
      }
    }
  });

  it("meldet auf einem sauberen Projekt nichts", async () => {
    // Der wichtigste Negativfall: ein Projekt, das alles richtig macht, muss
    // ein leeres Protokoll bekommen. Sonst ist jeder Bericht voller Rauschen.
    const sauber: Datei[] = [
      { pfad: "lib/db.ts", inhalt: "export const url = process.env.DATABASE_URL;" },
      {
        pfad: "migrations/001.sql",
        inhalt: `create table notizen (id uuid primary key, user_id text not null, text text);
alter table notizen enable row level security;
alter table notizen force row level security;
create policy nur_eigene on notizen for all using (user_id = current_user);`,
      },
      {
        pfad: "app/notizen/route.ts",
        inhalt: `export async function GET() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  return Response.json(await db.query('select 1'));
}`,
      },
    ];
    for (const angreifer of ALLE) {
      expect(await funde(angreifer, ...sauber)).toEqual([]);
    }
  });

  it("braucht keine Laufzeit — sie laufen ohne Sandbox", () => {
    // Das ist die Eigenschaft, die M0 überhaupt möglich macht, solange die
    // Sandbox-Laufzeit offen ist.
    for (const angreifer of ALLE) {
      expect(angreifer.brauchtLaufzeit).toBe(false);
    }
  });

  it("vergibt jede Klasse nur einmal", () => {
    const klassen = ALLE.map((a) => a.klasse);
    expect(new Set(klassen).size).toBe(klassen.length);
  });
});
