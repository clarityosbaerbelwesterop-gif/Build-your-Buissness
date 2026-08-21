/**
 * Der Filter für fremde Fehlertexte.
 *
 * Die Meldung eines Anbieters ist bei einem Fehlschlag die nützlichste
 * Information, die es gibt — und die einzige, von der wir nicht wissen, was
 * drinsteht. Sie landet im Protokoll eines CI-Laufs, das jeder mit
 * Repo-Zugriff lesen kann. Also: zeigen, aber gefiltert.
 *
 * Die Funktion steht in einer eigenen Datei, weil `migrieren.ts` beim Laden
 * eine Migration ausführt. Eine Funktion, die man nur testen kann, indem man
 * eine Datenbank verändert, wird nicht getestet.
 */

import { describe, expect, it } from "vitest";

import { ausUmgebung, entschaerfen, projektAusAbsage } from "./entschaerfen.js";

describe("entschaerfen", () => {
  it.each([
    ["Neon-Schlüssel", "Fehler bei napi_abcdefghijklmnopqrstuvwx"],
    ["NVIDIA-Schlüssel", "unerwartet: nvapi-abcdefghijklmnopqrstuvwx"],
    ["OpenAI-Format", "token sk-abcdefghijklmnopqrstuvwx ungültig"],
    ["GitHub-Format", "ghp_abcdefghijklmnopqrstuvwxyz012345"],
  ])("nimmt einen %s heraus", (_fall, text) => {
    const raus = entschaerfen(text);
    expect(raus).toContain("[Schlüssel entfernt]");
    expect(raus).not.toMatch(/abcdefghijklmnopqrstuvwx/);
  });

  it("nimmt einen ganzen Authorization-Kopf heraus", () => {
    // Manche Dienste spiegeln die Anfrage in der Fehlermeldung zurück.
    const raus = entschaerfen("request failed: Bearer napi_geheimniswert12345");
    expect(raus).not.toContain("napi_geheimniswert12345");
    expect(raus).toContain("[entfernt]");
  });

  it("lässt eine harmlose Meldung stehen", () => {
    // Ein Filter, der alles schwärzt, ist so nutzlos wie gar keine Meldung.
    const text = "project not found: org_id is required for personal API keys";
    expect(entschaerfen(text)).toBe(text);
  });

  it("kürzt sehr lange Antworten", () => {
    // Eine HTML-Fehlerseite von hunderten Zeilen begräbt den eigentlichen
    // Fehler im Protokoll.
    expect(entschaerfen("x".repeat(5_000))).toHaveLength(300);
  });

  it("kommt mit leerem Text zurecht", () => {
    expect(entschaerfen("")).toBe("");
  });
});

describe("projektAusAbsage", () => {
  it("liest die Kennung aus der echten Absage", () => {
    // Wortlaut aus dem Protokoll von Lauf 32485996512, nur der Schlüssel
    // ist da ohnehin nie aufgetaucht.
    const absage = 'Neon: HTTP 404 bei /projects?org_id=org-shiny-flower-01403126 — '
      + '{"request_id":"25c8","code":"","message":"not allowed to perform actions '
      + 'outside the project this key is scoped to; '
      + 'subject_project_id:\\"damp-dream-67070160\\""}';
    expect(projektAusAbsage(absage)).toBe("damp-dream-67070160");
  });

  it("liest sie auch ohne die maskierten Anführungszeichen", () => {
    // Je nachdem, ob der Text durch JSON.stringify gelaufen ist, stehen die
    // Anführungszeichen maskiert da oder nicht.
    expect(projektAusAbsage('subject_project_id:"still-sun-42"'))
      .toBe("still-sun-42");
  });

  it.each([
    ["andere Absage", "not allowed"],
    ["leer", ""],
    ["ähnlich, aber ohne Wert", 'subject_project_id:""'],
  ])("gibt bei %s nichts zurück", (_fall, text) => {
    expect(projektAusAbsage(text)).toBeUndefined();
  });

  it("erfindet keine Kennung aus einem Feld mit ähnlichem Namen", () => {
    // `project_id` ist nicht `subject_project_id`. Das falsche Projekt zu
    // migrieren merkt niemand sofort.
    expect(projektAusAbsage('project_id:"fremdes-projekt-99"')).toBeUndefined();
  });
});

describe("ausUmgebung", () => {
  it("gibt einen gesetzten Wert zurück", () => {
    expect(ausUmgebung("X", { X: "neondb" })).toBe("neondb");
  });

  it("behandelt eine leere Zeichenkette wie nicht gesetzt", () => {
    // Der eigentliche Anlass. GitHub Actions setzt ein Secret, das es nicht
    // gibt, als leeren String — nicht als „fehlt". Damit greift
    // `?? "vorgabe"` nicht, weil "" nicht nullish ist.
    expect(ausUmgebung("X", { X: "" })).toBeUndefined();
  });

  it("behandelt reinen Leerraum wie nicht gesetzt", () => {
    expect(ausUmgebung("X", { X: "   " })).toBeUndefined();
  });

  it("gibt undefined zurück, wenn der Name gar nicht vorkommt", () => {
    expect(ausUmgebung("X", {})).toBeUndefined();
  });

  it("schneidet Leerraum ab", () => {
    // Ein Wert aus der Zwischenablage trägt gern ein Zeilenende mit.
    expect(ausUmgebung("X", { X: " neondb\n" })).toBe("neondb");
  });

  it("die Vorgabe greift, wenn das Secret leer ist", () => {
    // Der Test, der den Fehlschlag beschreibt: vorher stand hier "" statt
    // "neondb", und die Anfrage ging als ?database_name= raus.
    expect(ausUmgebung("NEON_DATABASE", { NEON_DATABASE: "" }) ?? "neondb")
      .toBe("neondb");
  });
});
