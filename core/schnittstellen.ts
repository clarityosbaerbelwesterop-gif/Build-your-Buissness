/**
 * Die Schnittstellen zwischen Orchestrator, Angreifern und Fixern.
 *
 * Die Sandbox-Laufzeit ist offen (CLAUDE.md §3, blockiert M1). Diese Datei ist
 * die Antwort darauf: sie ist so geschnitten, dass ein Angreifer, der eine
 * laufende App braucht, später **ohne Änderung am Orchestrator** eingehängt
 * werden kann.
 *
 * Zwei Entscheidungen tragen das:
 *
 * 1. **Der Angreifer bekommt ein `Ziel`, keinen Dateipfad.** Ein statischer
 *    Angreifer liest `dateien`; ein Angreifer mit Sandbox liest zusätzlich
 *    `laufzeit`. Wäre die Schnittstelle auf Dateien geschnitten, müsste sie für
 *    M1 aufgebrochen werden.
 * 2. **`laufzeit` ist optional und darf fehlen.** Ein Angreifer, der sie
 *    braucht, sagt das über `brauchtLaufzeit` — und der Orchestrator
 *    überspringt ihn, statt ihn scheitern zu lassen. Ein übersprungener
 *    Angreifer taucht **nicht** in den gelaufenen Klassen auf: sonst stünde im
 *    Protokoll „geprüft auf X", wo nichts geprüft wurde.
 */

import type { Befund, Kosten } from "../protocol/v1.js";

/** Eine Datei des zu prüfenden Projekts. */
export interface Datei {
  readonly pfad: string;
  readonly inhalt: string;
}

/**
 * Eine laufende Instanz der gebauten App.
 *
 * In M0 gibt es sie nicht. Die Form steht trotzdem hier, weil sie festlegt,
 * was ein Angreifer in M1 erwarten darf — und weil ein Interface, das erst
 * beim Einbau entsteht, den Einbau zur Umbauaktion macht.
 */
export interface Laufzeit {
  /** Basis-URL der Instanz in der Sandbox. Nie eine fremde oder Produktions-URL. */
  readonly basisUrl: string;
  /** Eine Anfrage gegen die Instanz stellen. */
  anfragen(pfad: string, init?: RequestInit): Promise<Response>;
  /** SQL gegen die Datenbank des Laufs. Fehlt, wenn der Lauf keine hat. */
  readonly sql?: (abfrage: string) => Promise<readonly unknown[]>;
}

/** Was ein Angreifer zu sehen bekommt. */
export interface Ziel {
  readonly lauf_id: string;
  readonly dateien: readonly Datei[];
  /** Fehlt in M0 und in jedem Lauf ohne Sandbox. */
  readonly laufzeit?: Laufzeit;
}

/** Der Zusammenhang einer Runde. */
export interface RundenKontext {
  readonly runde: number;
  /** Alle bisherigen Befunde — ein Angreifer darf wissen, was schon gefunden wurde. */
  readonly bisherige: readonly Befund[];
}

/**
 * Ein Angreifer prüft eine Sache und liefert Befunde.
 *
 * Er vergibt **keine** IDs, keinen Zeitstempel und keine Rundennummer — das
 * macht der Orchestrator. Sonst hätte jeder Angreifer seine eigene Zählweise,
 * und zwei Angreifer könnten dieselbe ID vergeben.
 */
export interface Angreifer {
  /** Erscheint im Protokoll unter „geprüft auf". */
  readonly klasse: string;
  readonly kategorie: Befund["kategorie"];
  /** Wenn true, läuft er nur mit `ziel.laufzeit`. */
  readonly brauchtLaufzeit: boolean;
  angreifen(ziel: Ziel, kontext: RundenKontext): Promise<readonly RoherBefund[]>;
}

/** Was ein Angreifer liefert, bevor der Orchestrator ihn einordnet. */
export interface RoherBefund {
  readonly schweregrad: Befund["schweregrad"];
  readonly klartext: string;
  readonly nachweis: string;
}

/** Was ein Fixer zurückmeldet. */
export interface FixVersuch {
  /** Hat er etwas geändert? `false` heißt: er wusste nicht, wie. */
  readonly geaendert: boolean;
  /** Was er getan hat — landet im Protokoll, auch bei `geaendert: false`. */
  readonly beschreibung: string;
  /** Die geänderten Dateien. Leer, wenn nichts geändert wurde. */
  readonly dateien: readonly Datei[];
}

/**
 * Ein Fixer versucht, einen Befund zu beheben.
 *
 * Er meldet **einen Versuch**, keinen Erfolg. Ob der Fund weg ist, entscheidet
 * allein die erneute Prüfung in der nächsten Runde. Das ist der teuerste
 * Denkfehler, den diese Schleife vermeiden muss: „Fix geschrieben" ist nicht
 * „Fund behoben".
 */
export interface Fixer {
  fixen(befund: Befund, ziel: Ziel): Promise<FixVersuch>;
}

/** Misst, was eine Runde gekostet hat. */
export interface Kostenzaehler {
  /** Zurücksetzen und die Messung beginnen. */
  beginnen(): void;
  /** Beenden und den Verbrauch der Runde liefern. */
  beenden(): Kosten;
}

/**
 * Ein Kostenzähler, der nur die Zeit misst.
 *
 * In M0 kostet nichts Tokens — die Angreifer arbeiten statisch. Der Zähler
 * steht trotzdem im Ablauf, weil der Kostendeckel sonst eine Einstellung wäre,
 * die nichts tut. Ab M1 tritt hier ein Zähler an seine Stelle, der die Tokens
 * der Modellaufrufe bucht.
 */
export class Zeitzaehler implements Kostenzaehler {
  #start = 0;
  readonly #jetzt: () => number;

  constructor(jetzt: () => number = () => Date.now()) {
    this.#jetzt = jetzt;
  }

  beginnen(): void {
    this.#start = this.#jetzt();
  }

  beenden(): Kosten {
    return {
      tokens_ein: 0,
      tokens_aus: 0,
      laufzeit_ms: Math.max(0, this.#jetzt() - this.#start),
    };
  }
}
