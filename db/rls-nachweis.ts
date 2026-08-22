/**
 * RLS-Nachweis gegen einen frischen Neon-Zweig.
 *
 * Ablauf: Zweig anlegen → geerbtes BYB-Schema auf diesem Testzweig entfernen →
 * Migration anwenden → nicht-privilegierte Eigentümerrolle anlegen →
 * Mandantentrennung prüfen → Gegenprobe → **Rolle und Zweig löschen**.
 *
 * Neon-Zweige erben den Stand ihres Elternzweigs. Deshalb ist „frischer Zweig"
 * nicht dasselbe wie „leere Datenbank": ohne den Reset unten würde die
 * Migration gegen bereits vorhandene Tabellen und Policies laufen.
 *
 * Der Neon-Verbindungsnutzer ist für Verwaltung gedacht und kann RLS umgehen.
 * Ein Verhaltenstest unter diesem Nutzer produziert deshalb Scheintreffer,
 * selbst wenn ENABLE, FORCE und Policy korrekt sind. Der Nachweis erstellt auf
 * dem isolierten Testzweig eine Rolle ohne SUPERUSER/BYPASSRLS, macht sie zum
 * Eigentümer der Testtabellen und führt die Nutzeraktionen unter `SET ROLE`
 * aus. Genau dadurch wird auch fehlendes FORCE sichtbar: ein Tabellenbesitzer
 * ohne FORCE umgeht RLS, derselbe Besitzer mit FORCE nicht.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import { pflicht } from "../config/umgebung.js";
import { entschaerfen } from "./entschaerfen.js";
import { projektWaehlen, zweigAnlegen, zweigLoeschen } from "./neon-api.js";
import type { Verbindung, Verstoss } from "./rls-pruefung.js";
import { MANDANT_A, bericht, tabellePruefen } from "./rls-pruefung.js";

const SCHEMA = readFileSync(
  fileURLToPath(new URL("./001_grundschema.sql", import.meta.url)),
  "utf8",
);

const TABELLEN = ["laeufe", "protokolle", "befunde", "runden"] as const;

const RESET_EIGENES_SCHEMA = `
  drop table if exists runden cascade;
  drop table if exists befunde cascade;
  drop table if exists protokolle cascade;
  drop table if exists laeufe cascade;
`;

function sqlIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("Ungueltiger SQL-Bezeichner.");
  return `"${name}"`;
}

async function pruefrolleAnlegen(v: Verbindung, rollenname: string): Promise<void> {
  const rolle = sqlIdent(rollenname);
  await v.query(
    `create role ${rolle} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls`,
  );
  await v.query(`grant ${rolle} to current_user`);

  // PostgreSQL verlangt CREATE auf dem Schema, bevor eine Rolle Eigentümer
  // einer Tabelle in diesem Schema werden darf. Die Rolle existiert nur auf
  // dem kurzlebigen Testzweig, ist NOLOGIN und wird im finally entfernt.
  await v.query(`grant usage, create on schema public to ${rolle}`);
  await v.query(`grant usage on schema auth to ${rolle}`);
  await v.query(`grant execute on function auth.nutzer_kennung() to ${rolle}`);

  for (const tabelle of TABELLEN) {
    await v.query(`alter table ${sqlIdent(tabelle)} owner to ${rolle}`);
  }
}

async function pruefrolleAufraeumen(v: Verbindung, rollenname: string): Promise<void> {
  const rolle = sqlIdent(rollenname);
  await v.query("reset role").catch(() => undefined);
  await v.query(`reassign owned by ${rolle} to current_user`).catch(() => undefined);
  await v.query(`drop owned by ${rolle}`).catch(() => undefined);
  await v.query(`drop role if exists ${rolle}`).catch(() => undefined);
}

function anlegerFuer(
  v: Verbindung,
  tabelle: string,
  eltern: Map<string, { lauf: string; protokoll: string }>,
): (mandant: string) => Promise<string> {
  async function elternHolen(mandant: string): Promise<{ lauf: string; protokoll: string }> {
    const da = eltern.get(mandant);
    if (da !== undefined) return da;
    const lauf = await eineZeile(
      v,
      `insert into laeufe (nutzer_id, beschreibung) values ($1, 'RLS-Nachweis') returning id`,
      [mandant],
    );
    const protokoll = await eineZeile(
      v,
      `insert into protokolle (lauf_id, nutzer_id, version, endzustand, abbruchgrund)
       values ($1, $2, 1, 'sauber', 'keine_offenen_befunde') returning id`,
      [lauf, mandant],
    );
    const neu = { lauf, protokoll };
    eltern.set(mandant, neu);
    return neu;
  }

  switch (tabelle) {
    case "laeufe":
      return (mandant) =>
        eineZeile(
          v,
          `insert into laeufe (nutzer_id, beschreibung) values ($1, 'RLS-Nachweis') returning id`,
          [mandant],
        );
    case "protokolle":
      return async (mandant) => {
        const { lauf } = await elternHolen(mandant);
        return eineZeile(
          v,
          `insert into protokolle (lauf_id, nutzer_id, version, endzustand, abbruchgrund)
           values ($1, $2, 1, 'sauber', 'keine_offenen_befunde') returning id`,
          [lauf, mandant],
        );
      };
    case "befunde":
      return async (mandant) => {
        const { protokoll } = await elternHolen(mandant);
        return eineZeile(
          v,
          `insert into befunde
             (protokoll_id, nutzer_id, kategorie, angriffsklasse, schweregrad,
              klartext, nachweis, zustand, runde)
           values ($1, $2, 'zugangsdaten', 'rls-nachweis', 'niedrig',
                   'Diese Zeile gehoert zum RLS-Nachweis und wird gleich wieder geloescht.',
                   'rls-nachweis', 'gefunden', 1)
           returning id`,
          [protokoll, mandant],
        );
      };
    case "runden":
      return async (mandant) => {
        const { protokoll } = await elternHolen(mandant);
        return eineZeile(
          v,
          `insert into runden (protokoll_id, nutzer_id, nummer)
           values ($1, $2, 1) returning id`,
          [protokoll, mandant],
        );
      };
    default:
      throw new Error(`Unbekannte Tabelle: ${tabelle}`);
  }
}

async function eineZeile(
  v: Verbindung,
  sql: string,
  werte: readonly unknown[],
): Promise<string> {
  const ergebnis = await v.query(sql, werte);
  const id = ergebnis.rows[0]?.["id"];
  if (typeof id !== "string") {
    throw new Error(`Einfuegen lieferte keine id zurueck (${sql.slice(0, 40)}…)`);
  }
  return id;
}

async function gegenprobe(v: Verbindung, rollenname: string): Promise<string[]> {
  const klagen: string[] = [];
  const rolle = sqlIdent(rollenname);

  const faelle = [
    {
      name: "ohne_force",
      sql: `
        create table probe_ohne_force (
          id uuid primary key default gen_random_uuid(),
          nutzer_id text not null
        );
        alter table probe_ohne_force enable row level security;
        create policy probe_ohne_force_eigene on probe_ohne_force for all
          using      (nutzer_id = auth.nutzer_kennung())
          with check (nutzer_id = auth.nutzer_kennung());`,
      warum: "ENABLE ohne FORCE — der Eigentuemer umgeht die Regel",
    },
    {
      name: "ohne_policy",
      sql: `
        create table probe_ohne_policy (
          id uuid primary key default gen_random_uuid(),
          nutzer_id text not null
        );`,
      warum: "gar kein RLS",
    },
  ];

  for (const fall of faelle) {
    const tabelle = `probe_${fall.name}`;
    await v.query("reset role");
    await v.query(fall.sql);
    await v.query(`alter table ${sqlIdent(tabelle)} owner to ${rolle}`);
    await v.query(`set role ${rolle}`);

    const anlegen = (mandant: string): Promise<string> =>
      eineZeile(v, `insert into ${sqlIdent(tabelle)} (nutzer_id) values ($1) returning id`, [mandant]);
    const verstoesse = await tabellePruefen(v, tabelle, anlegen);
    if (verstoesse.length === 0) {
      klagen.push(
        `Die Pruefung meldet nichts bei „${fall.warum}". Sie kann damit auch `
        + `bei den echten Tabellen nichts belegen.`,
      );
    } else {
      console.error(
        `  Gegenprobe ${tabelle}: ${verstoesse.length} Verstoss/Verstoesse `
        + `wie erwartet (${fall.warum}).`,
      );
    }

    await v.query("reset role");
    await v.query(`drop table if exists ${sqlIdent(tabelle)}`);
  }
  return klagen;
}

const schluessel = pflicht("NEON_API_KEY", "einen Zweig fuer den RLS-Nachweis anlegen");
const projekt = await projektWaehlen(schluessel);
console.error(`Projekt: ${projekt.name} (${projekt.id})`);

const name = `rls-nachweis-${Date.now()}`;
const rollenname = `byb_rls_probe_${Date.now()}`;
const zweig = await zweigAnlegen(projekt.id, schluessel, name);
console.error(`Zweig angelegt: ${zweig.name} (${zweig.id})`);

let fehlgeschlagen = false;
let rolleAngelegt = false;
const klient = new Client({
  connectionString: zweig.verbindung,
  ssl: { rejectUnauthorized: true },
});

try {
  await klient.connect();
  await klient.query(RESET_EIGENES_SCHEMA);
  console.error("Geerbtes BYB-Grundschema auf dem Testzweig entfernt.");
  await klient.query(SCHEMA);
  console.error("Schema aus dem aktuellen Branch auf dem Testzweig angewendet.");

  await pruefrolleAnlegen(klient, rollenname);
  rolleAngelegt = true;
  await klient.query(`set role ${sqlIdent(rollenname)}`);
  console.error("RLS-Pruefung laeuft als nicht-privilegierter Tabellenbesitzer.");

  const alle: Verstoss[] = [];
  const eltern = new Map<string, { lauf: string; protokoll: string }>();
  for (const tabelle of TABELLEN) {
    const anlegen = anlegerFuer(klient, tabelle, eltern);
    alle.push(...(await tabellePruefen(klient, tabelle, anlegen)));
  }

  console.error("");
  console.error(bericht(alle, [...TABELLEN]));
  console.error("");

  const klagen = await gegenprobe(klient, rollenname);
  for (const klage of klagen) console.error(`  ${klage}`);

  fehlgeschlagen = alle.length > 0 || klagen.length > 0;
  if (!fehlgeschlagen) {
    console.error("");
    console.error(
      `Geprueft: kein Mandant erreicht die Zeilen eines anderen — lesend, `
      + `aendernd, loeschend, und keiner kann auf fremde Kennung schreiben. `
      + `Die Gegenprobe schlaegt bei fehlendem FORCE und fehlender Policy an. `
      + `Mandant A war ${MANDANT_A}.`,
    );
  }
} catch (fehler) {
  fehlgeschlagen = true;
  console.error(`RLS-Nachweis abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  if (rolleAngelegt) await pruefrolleAufraeumen(klient, rollenname);
  await klient.end().catch(() => undefined);
  await zweigLoeschen(projekt.id, schluessel, zweig.id);
  console.error(`Zweig geloescht: ${zweig.name}`);
}

process.exit(fehlgeschlagen ? 1 : 0);
