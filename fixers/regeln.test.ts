import { describe, expect, it } from "vitest";

import type { Befund } from "../protocol/v1.js";
import type { Angreifer, Datei, RoherBefund, Ziel } from "../core/schnittstellen.js";
import { routeOhneAuth } from "../attackers/auth.js";
import { tabelleOhneRls } from "../attackers/rls.js";
import { zugangsdatenImQuelltext } from "../attackers/zugangsdaten.js";
import { regelFixer } from "./regeln.js";

const KONTEXT = { runde: 1, bisherige: [] };

function ziel(...dateien: Datei[]): Ziel {
  return { lauf_id: "fix-test", dateien };
}

function zuBefund(angreifer: Angreifer, roh: RoherBefund): Befund {
  return {
    id: "b-1",
    kategorie: angreifer.kategorie,
    angriffsklasse: angreifer.klasse,
    schweregrad: roh.schweregrad,
    klartext: roh.klartext,
    nachweis: roh.nachweis,
    zustand: "gefunden",
    runde: 1,
    zeitstempel: 1,
  };
}

async function ersterFund(angreifer: Angreifer, z: Ziel): Promise<Befund> {
  const rohe = await angreifer.angreifen(z, KONTEXT);
  const roh = rohe[0];
  if (roh === undefined) throw new Error(`Testaufbau fuer ${angreifer.klasse} erzeugt keinen Fund.`);
  return zuBefund(angreifer, roh);
}

function anwenden(z: Ziel, geaendert: readonly Datei[]): Ziel {
  const karte = new Map(z.dateien.map((datei) => [datei.pfad, datei]));
  for (const datei of geaendert) karte.set(datei.pfad, datei);
  return { ...z, dateien: [...karte.values()] };
}

describe("Zugangsdaten-Fixer", () => {
  it("ersetzt ein eigenstaendiges String-Literal durch eine Laufzeitvariable", async () => {
    let z = ziel({
      pfad: "lib/nvidia.ts",
      inhalt: 'export const key = "nvapi-abcdefghijklmnopqrstuvwxyz0123";',
    });
    const befund = await ersterFund(zugangsdatenImQuelltext, z);
    const versuch = await regelFixer.fixen(befund, z);

    expect(versuch.geaendert).toBe(true);
    z = anwenden(z, versuch.dateien);
    expect(z.dateien.find((d) => d.pfad === "lib/nvidia.ts")?.inhalt)
      .toContain("process.env.NVIDIA_API_KEY");
    expect(z.dateien.find((d) => d.pfad === ".env.example")?.inhalt)
      .toContain("NVIDIA_API_KEY=");
    expect(await zugangsdatenImQuelltext.angreifen(z, KONTEXT)).toEqual([]);
  });

  it("fasst einen Wert in einem zusammengesetzten Ausdruck nicht an", async () => {
    const z = ziel({
      pfad: "lib/nvidia.ts",
      inhalt: 'export const header = "Bearer nvapi-abcdefghijklmnopqrstuvwxyz0123";',
    });
    const befund = await ersterFund(zugangsdatenImQuelltext, z);
    const versuch = await regelFixer.fixen(befund, z);
    expect(versuch.geaendert).toBe(false);
  });
});

describe("RLS-Fixer", () => {
  it("ergaenzt FORCE, wenn ENABLE und eine Policy schon vorhanden sind", async () => {
    let z = ziel({
      pfad: "migrations/001.sql",
      inhalt: `create table bestellungen (id uuid, user_id text not null);
alter table bestellungen enable row level security;
create policy p on bestellungen for all using (user_id = current_user);`,
    });
    const befund = await ersterFund(tabelleOhneRls, z);
    const versuch = await regelFixer.fixen(befund, z);

    expect(versuch.geaendert).toBe(true);
    z = anwenden(z, versuch.dateien);
    expect(z.dateien[0]?.inhalt).toContain("force row level security");
    expect(await tabelleOhneRls.angreifen(z, KONTEXT)).toEqual([]);
  });

  it("loest fehlendes RLS in zwei deterministischen Runden", async () => {
    let z = ziel({
      pfad: "migrations/001.sql",
      inhalt: `create schema if not exists auth;
create or replace function auth.nutzer_kennung() returns text language sql stable
as $$ select 'x'::text $$;
create table notizen (id uuid, nutzer_id text not null);`,
    });

    const erster = await ersterFund(tabelleOhneRls, z);
    const ersterFix = await regelFixer.fixen(erster, z);
    expect(ersterFix.geaendert).toBe(true);
    z = anwenden(z, ersterFix.dateien);

    const danach = await tabelleOhneRls.angreifen(z, KONTEXT);
    expect(danach).toHaveLength(1);
    expect(danach[0]?.nachweis).toContain("ohne CREATE POLICY");

    const zweiterFix = await regelFixer.fixen(zuBefund(tabelleOhneRls, danach[0]!), z);
    expect(zweiterFix.geaendert).toBe(true);
    z = anwenden(z, zweiterFix.dateien);
    expect(await tabelleOhneRls.angreifen(z, KONTEXT)).toEqual([]);
  });

  it("erfindet keine Policy fuer ein unbekanntes Mandantenmodell", async () => {
    const z = ziel({
      pfad: "migrations/001.sql",
      inhalt: `create table bestellungen (id uuid, tenant_id uuid not null);
alter table bestellungen enable row level security;
alter table bestellungen force row level security;`,
    });
    const befund = await ersterFund(tabelleOhneRls, z);
    const versuch = await regelFixer.fixen(befund, z);
    expect(versuch.geaendert).toBe(false);
  });
});

describe("Auth-Fixer", () => {
  it("nutzt einen vorhandenen parameterlosen requireAuth-Helper", async () => {
    let z = ziel(
      {
        pfad: "lib/auth.ts",
        inhalt: "export async function requireAuth() { return { userId: 'u' }; }",
      },
      {
        pfad: "app/bestellungen/route.ts",
        inhalt:
          "export async function GET() { return Response.json(await db.query('select * from bestellungen')); }",
      },
    );
    const befund = await ersterFund(routeOhneAuth, z);
    const versuch = await regelFixer.fixen(befund, z);

    expect(versuch.geaendert).toBe(true);
    z = anwenden(z, versuch.dateien);
    const route = z.dateien.find((d) => d.pfad === "app/bestellungen/route.ts")?.inhalt ?? "";
    expect(route).toContain('import { requireAuth } from "../../lib/auth";');
    expect(route).toContain("await requireAuth();");
    expect(await routeOhneAuth.angreifen(z, KONTEXT)).toEqual([]);
  });

  it("laesst den Fund offen, wenn kein Auth-Helper vorhanden ist", async () => {
    const z = ziel({
      pfad: "app/bestellungen/route.ts",
      inhalt:
        "export async function GET() { return Response.json(await db.query('select * from bestellungen')); }",
    });
    const befund = await ersterFund(routeOhneAuth, z);
    const versuch = await regelFixer.fixen(befund, z);
    expect(versuch.geaendert).toBe(false);
  });
});
