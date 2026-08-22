/**
 * RLS-Nachweis gegen einen frischen Neon-Zweig.
 *
 * Ablauf: Zweig anlegen → geerbtes BYB-Schema auf diesem Testzweig entfernen →
 * Migration anwenden → Mandantentrennung prüfen → Gegenprobe → **Zweig löschen,
 * in jedem Fall**.
 *
 * Warum ein eigener Zweig und nicht die vorhandene Datenbank: die Prüfung legt
 * Zeilen an, ändert und löscht. CLAUDE.md §2.3 lässt das nur gegen etwas zu,
 * das im selben Lauf entstanden ist — „nie gegen Produktion, nie gegen etwas
 * mit echten Nutzerdaten". Ein Zweig bei Neon kostet Sekunden; die Regel
 * dafür zu beugen kostet irgendwann Kundendaten.
 *
 * Neon-Zweige erben den Stand ihres Elternzweigs. Deshalb ist „frischer Zweig"
 * nicht dasselbe wie „leere Datenbank": ohne den Reset unten würde die
 * Migration gegen bereits vorhandene Tabellen und Policies laufen. Der Reset
 * löscht ausschließlich die vier BYB-Tabellen auf dem gerade erzeugten
 * Testzweig. Danach beweist der Lauf sowohl die Migration als auch die Policies
 * aus dem aktuellen PR statt nur den bereits deployten Stand des Elternzweigs.
 *
 * Warum kein vitest: der Zweig muss auch dann verschwinden, wenn mitten in der
 * Prüfung etwas wirft. Ein `finally` um den ganzen Ablauf ist dafür
 * verlässlicher als eine Aufräumregel im Testläufer, die bei einem harten
 * Abbruch nicht mehr drankommt. Und die Prüfung braucht Zugangsdaten und Netz
 * — sie gehört nicht in `npm test`, das in jedem Klon laufen muss.
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

/** Die vier Tabellen mit Mandantenbezug — dieselben wie in der Migration. */
const TABELLEN = ["laeufe", "protokolle", "befunde", "runden"] as const;

/**
 * Neon kopiert beim Branching auch das vorhandene Schema. Für den Nachweis
 * brauchen wir aber den Zustand „vor dieser Migration". Gelöscht wird nur auf
 * dem im selben Lauf angelegten Zweig und nur das eigene BYB-Grundschema.
 */
const RESET_EIGENES_SCHEMA = `
  drop table if exists runden cascade;
  drop table if exists befunde cascade;
  drop table if exists protokolle cascade;
  drop table if exists laeufe cascade;
`;

/**
 * Wie man in jeder Tabelle eine Zeile für einen Mandanten anlegt.
 *
 * Die Tabellen hängen aneinander (`protokolle` → `laeufe`, `befunde` und
 * `runden` → `protokolle`). Für jeden Mandanten wird deshalb erst ein Lauf und
 * ein Protokoll gebraucht; die merkt sich diese Karte.
 */
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
        // `nummer` ist je Protokoll eindeutig — je Mandant ein eigenes
        // Protokoll, also darf beide Male 1 stehen.
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

/**
 * Die Gegenprobe: hat die Prüfung überhaupt Zähne?
 *
 * Sie legt zwei Tabellen an, denen genau das fehlt, was die Migration richtig
 * macht — einer ohne `FORCE`, einer ganz ohne Policy — und erwartet, dass die
 * Prüfung dort **anschlägt**. Ohne diesen Schritt wäre ein grüner Lauf auch
 * dann grün, wenn die Prüfung gar nichts prüft; das ist der Fehler, der bei
 * einem Sicherheitsnachweis am teuersten ist.
 */
async function gegenprobe(v: Verbindung): Promise<string[]> {
  const klagen: string[] = [];

  const faelle = [
    {
      name: "ohne_force",
      sql: `
        create table if not exists probe_ohne_force (
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
        create table if not exists probe_ohne_policy (
          id uuid primary key default gen_random_uuid(),
          nutzer_id text not null
        );`,
      warum: "gar kein RLS",
    },
  ];

  for (const fall of faelle) {
    const tabelle = `probe_${fall.name}`;
    await v.query(fall.sql);
    const anlegen = (mandant: string): Promise<string> =>
      eineZeile(v, `insert into ${tabelle} (nutzer_id) values ($1) returning id`, [mandant]);
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
    await v.query(`drop table if exists ${tabelle}`);
  }
  return klagen;
}

// ============================================================================
// Ablauf
// ============================================================================

const schluessel = pflicht("NEON_API_KEY", "einen Zweig fuer den RLS-Nachweis anlegen");
const projekt = await projektWaehlen(schluessel);
console.error(`Projekt: ${projekt.name} (${projekt.id})`);

const name = `rls-nachweis-${Date.now()}`;
const zweig = await zweigAnlegen(projekt.id, schluessel, name);
console.error(`Zweig angelegt: ${zweig.name} (${zweig.id})`);

let fehlgeschlagen = false;
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

  const alle: Verstoss[] = [];
  const eltern = new Map<string, { lauf: string; protokoll: string }>();
  for (const tabelle of TABELLEN) {
    const anlegen = anlegerFuer(klient, tabelle, eltern);
    alle.push(...(await tabellePruefen(klient, tabelle, anlegen)));
  }

  console.error("");
  console.error(bericht(alle, [...TABELLEN]));
  console.error("");

  const klagen = await gegenprobe(klient);
  for (const klage of klagen) console.error(`  ${klage}`);

  fehlgeschlagen = alle.length > 0 || klagen.length > 0;
  if (!fehlgeschlagen) {
    console.error("");
    console.error(
      `Geprueft: kein Mandant erreicht die Zeilen eines anderen — lesend, `
      + `aendernd, loeschend, und keiner kann auf fremde Kennung schreiben. `
      + `Die Gegenprobe schlaegt bei fehlendem FORCE und fehlender Policy an, `
      + `die Pruefung hat also Zaehne. Mandant A war ${MANDANT_A}.`,
    );
  }
} catch (fehler) {
  fehlgeschlagen = true;
  console.error(`RLS-Nachweis abgebrochen: ${entschaerfen((fehler as Error).message)}`);
} finally {
  await klient.end().catch(() => undefined);
  // Der Zweig verschwindet auch, wenn oben etwas geworfen hat. Ein Zweig, den
  // niemand aufraeumt, kostet Geld und steht beim naechsten Lauf im Weg.
  await zweigLoeschen(projekt.id, schluessel, zweig.id);
  console.error(`Zweig geloescht: ${zweig.name}`);
}

process.exit(fehlgeschlagen ? 1 : 0);
