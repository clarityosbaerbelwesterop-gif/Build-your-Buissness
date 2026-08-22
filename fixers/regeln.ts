/**
 * Regelbasierte Fixer fuer die drei statischen Angriffsklassen aus M0.
 *
 * Grundsatz: nur aendern, wenn die richtige Transformation aus dem Fund und
 * dem vorhandenen Projekt ableitbar ist. Fehlt dafuer Kontext, bleibt der Fund
 * offen. Ein nicht ausgefuehrter Fix ist billiger als erfundene Auth- oder
 * Datenbanklogik.
 */

import { posix } from "node:path";

import type { Befund } from "../protocol/v1.js";
import type { Datei, Fixer, FixVersuch, Ziel } from "../core/schnittstellen.js";
import { zugangsdatenTreffer } from "../attackers/zugangsdaten-muster.js";

const CODE_DATEI = /\.[cm]?[jt]sx?$/i;

function ohneAenderung(beschreibung: string): FixVersuch {
  return { geaendert: false, beschreibung, dateien: [] };
}

function fundDatei(befund: Befund, ziel: Ziel): Datei | undefined {
  const treffer = /^(.+):(\d+)\s{2}/.exec(befund.nachweis);
  const pfad = treffer?.[1];
  return pfad === undefined ? undefined : ziel.dateien.find((datei) => datei.pfad === pfad);
}

function envBeispiel(ziel: Ziel, name: string): Datei | undefined {
  const vorhanden = ziel.dateien.find((datei) => datei.pfad === ".env.example");
  if (vorhanden === undefined) {
    return { pfad: ".env.example", inhalt: `${name}=\n` };
  }

  const zeilen = vorhanden.inhalt.split("\n");
  if (zeilen.some((zeile) => zeile.trimStart().startsWith(`${name}=`))) return undefined;
  const trenner = vorhanden.inhalt.length === 0 || vorhanden.inhalt.endsWith("\n") ? "" : "\n";
  return { ...vorhanden, inhalt: `${vorhanden.inhalt}${trenner}${name}=\n` };
}

function zugangsdatenFixen(befund: Befund, ziel: Ziel): FixVersuch {
  const datei = fundDatei(befund, ziel);
  if (datei === undefined || !CODE_DATEI.test(datei.pfad)) {
    return ohneAenderung(
      "Der Fund liegt nicht in einer JavaScript-/TypeScript-Datei; ohne Sprachkontext wird nichts ersetzt.",
    );
  }

  const treffer = zugangsdatenTreffer(datei.inhalt)
    .find((fund) => befund.nachweis.includes(fund.regel.name));
  if (treffer === undefined) {
    return ohneAenderung(
      "Der konkrete Zugangsdaten-Treffer laesst sich aus dem Nachweis nicht eindeutig wiederfinden.",
    );
  }

  const davor = datei.inhalt[treffer.start - 1];
  const danach = datei.inhalt[treffer.ende];
  if (davor === undefined || danach !== davor || !["'", '"', "`"].includes(davor)) {
    return ohneAenderung(
      "Der Wert ist kein eigenstaendiges String-Literal; ein automatischer Ersatz koennte Ausdruck oder Syntax zerstoeren.",
    );
  }

  const ersatz = `process.env.${treffer.regel.umgebungsvariable}`;
  const neu =
    datei.inhalt.slice(0, treffer.start - 1)
    + ersatz
    + datei.inhalt.slice(treffer.ende + 1);
  const dateien: Datei[] = [{ ...datei, inhalt: neu }];
  const beispiel = envBeispiel(ziel, treffer.regel.umgebungsvariable);
  if (beispiel !== undefined) dateien.push(beispiel);

  return {
    geaendert: true,
    beschreibung:
      `${treffer.regel.name} aus dem String-Literal entfernt und durch `
      + `${treffer.regel.umgebungsvariable} als Laufzeitvariable ersetzt.`,
    dateien,
  };
}

function tabellennameAusNachweis(nachweis: string): string | undefined {
  return /:\d+\s{2}([a-z_][a-z0-9_]*)\s{2}—/i.exec(nachweis)?.[1];
}

function createTableEnde(sql: string, tabelle: string): number | undefined {
  const start = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?["\\`]?${tabelle}["\\`]?\\s*\\(`,
    "i",
  ).exec(sql);
  if (start === null) return undefined;

  let tiefe = 0;
  const klammer = start.index + start[0].length - 1;
  for (let i = klammer; i < sql.length; i++) {
    const zeichen = sql[i];
    if (zeichen === "(") tiefe += 1;
    if (zeichen === ")") {
      tiefe -= 1;
      if (tiefe === 0) {
        const semikolon = sql.slice(i).match(/^\s*;/);
        return semikolon === null ? i + 1 : i + semikolon[0].length;
      }
    }
  }
  return undefined;
}

function rlsFixen(befund: Befund, ziel: Ziel): FixVersuch {
  const datei = fundDatei(befund, ziel);
  const tabelle = tabellennameAusNachweis(befund.nachweis);
  if (datei === undefined || tabelle === undefined || !/\.sql$/i.test(datei.pfad)) {
    return ohneAenderung("SQL-Datei oder Tabellenname konnte aus dem Nachweis nicht eindeutig bestimmt werden.");
  }

  if (befund.nachweis.includes("kein ENABLE ROW LEVEL SECURITY")) {
    const ende = createTableEnde(datei.inhalt, tabelle);
    if (ende === undefined) {
      return ohneAenderung("Die CREATE-TABLE-Anweisung konnte nicht eindeutig begrenzt werden.");
    }
    const block =
      `\nalter table ${tabelle} enable row level security;`
      + `\nalter table ${tabelle} force row level security;`;
    return {
      geaendert: true,
      beschreibung: `RLS und FORCE fuer ${tabelle} direkt nach CREATE TABLE ergaenzt.`,
      dateien: [{ ...datei, inhalt: datei.inhalt.slice(0, ende) + block + datei.inhalt.slice(ende) }],
    };
  }

  if (befund.nachweis.includes("ENABLE ohne FORCE ROW LEVEL SECURITY")) {
    const enable = new RegExp(
      `(alter\\s+table\\s+["\\`]?${tabelle}["\\`]?\\s+enable\\s+row\\s+level\\s+security\\s*;)`,
      "i",
    );
    if (!enable.test(datei.inhalt)) {
      return ohneAenderung("Die vorhandene ENABLE-Anweisung konnte nicht eindeutig gefunden werden.");
    }
    const neu = datei.inhalt.replace(
      enable,
      `$1\nalter table ${tabelle} force row level security;`,
    );
    return {
      geaendert: true,
      beschreibung: `FORCE ROW LEVEL SECURITY fuer ${tabelle} ergaenzt.`,
      dateien: [{ ...datei, inhalt: neu }],
    };
  }

  if (befund.nachweis.includes("ENABLE ohne CREATE POLICY")) {
    const ende = createTableEnde(datei.inhalt, tabelle);
    if (ende === undefined) {
      return ohneAenderung("Die CREATE-TABLE-Anweisung konnte nicht eindeutig begrenzt werden.");
    }
    const definition = datei.inhalt.slice(0, ende);
    if (!/\bnutzer_id\b/i.test(definition) || !/auth\.nutzer_kennung\s*\(\s*\)/i.test(datei.inhalt)) {
      return ohneAenderung(
        "Eine Policy wird nur automatisch erzeugt, wenn die Tabelle nutzer_id nutzt und auth.nutzer_kennung() im Schema vorhanden ist.",
      );
    }
    const policy =
      `\ncreate policy ${tabelle}_eigene on ${tabelle} for all\n`
      + `  using      (nutzer_id = auth.nutzer_kennung())\n`
      + `  with check (nutzer_id = auth.nutzer_kennung());\n`;
    return {
      geaendert: true,
      beschreibung: `Mandanten-Policy fuer ${tabelle} auf nutzer_id ergaenzt.`,
      dateien: [{ ...datei, inhalt: `${datei.inhalt.trimEnd()}${policy}` }],
    };
  }

  return ohneAenderung("Die RLS-Variante dieses Befunds hat noch keine deterministische Regel.");
}

function requireAuthHelper(ziel: Ziel): Datei | undefined {
  const funktion = /export\s+(?:async\s+)?function\s+requireAuth\s*\(\s*\)/;
  const konstante = /export\s+const\s+requireAuth\s*=\s*(?:async\s*)?\(\s*\)/;
  return ziel.dateien.find((datei) => funktion.test(datei.inhalt) || konstante.test(datei.inhalt));
}

function importPfad(von: string, nach: string): string {
  const ohneEndung = nach.replace(/\.[cm]?[jt]sx?$/i, "");
  const relativ = posix.relative(posix.dirname(von), ohneEndung);
  return relativ.startsWith(".") ? relativ : `./${relativ}`;
}

function authFixen(befund: Befund, ziel: Ziel): FixVersuch {
  const route = fundDatei(befund, ziel);
  const helper = requireAuthHelper(ziel);
  if (route === undefined || helper === undefined || route.pfad === helper.pfad) {
    return ohneAenderung(
      "Kein vorhandener, parameterloser requireAuth-Helper gefunden; Auth-Logik wird nicht erfunden.",
    );
  }

  const handler = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*\{/g;
  if (!handler.test(route.inhalt)) {
    return ohneAenderung("Kein asynchroner Route-Handler gefunden, in den requireAuth eingefuegt werden kann.");
  }
  handler.lastIndex = 0;

  const mitPruefung = route.inhalt.replace(handler, (kopf) => `${kopf}\n  await requireAuth();`);
  const specifier = importPfad(route.pfad, helper.pfad);
  const mitImport = `import { requireAuth } from "${specifier}";\n${mitPruefung}`;

  return {
    geaendert: true,
    beschreibung: `Vor den Route-Handlern wird der vorhandene requireAuth-Helper aus ${helper.pfad} aufgerufen.`,
    dateien: [{ ...route, inhalt: mitImport }],
  };
}

export const regelFixer: Fixer = {
  fixen(befund: Befund, ziel: Ziel): Promise<FixVersuch> {
    switch (befund.angriffsklasse) {
      case "zugangsdaten-im-quelltext":
        return Promise.resolve(zugangsdatenFixen(befund, ziel));
      case "tabelle-ohne-rls":
        return Promise.resolve(rlsFixen(befund, ziel));
      case "route-ohne-auth-pruefung":
        return Promise.resolve(authFixen(befund, ziel));
      default:
        return Promise.resolve(
          ohneAenderung(`Keine feste Regel fuer Angriffsklasse ${befund.angriffsklasse}.`),
        );
    }
  },
};
