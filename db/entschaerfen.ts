/**
 * Fremde Fehlertexte so kürzen, dass sie in ein öffentliches Protokoll dürfen.
 *
 * Die Meldung eines Anbieters ist bei einem Fehlschlag die nützlichste
 * Information, die es gibt — und die einzige, von der wir vorher nicht wissen,
 * was drinsteht. Sie wegzulassen war die vorsichtige Wahl und hat uns bei
 * „HTTP 404 bei /projects" genau nichts gesagt. Sie gefiltert zu zeigen ist
 * die brauchbare.
 *
 * Eigene Datei, nicht in `migrieren.ts`: das Skript führt beim Laden eine
 * Migration aus. Eine Funktion, die man nur testen kann, indem man eine
 * Datenbank verändert, wird nicht getestet.
 */

/** Grenze für fremden Text. Eine HTML-Fehlerseite über hunderte Zeilen
 *  begräbt im Protokoll genau den Fehler, den sie erklären soll. */
const HOECHSTLAENGE = 300;

export function entschaerfen(text: string): string {
  return text
    .replace(/\b(napi|nvapi|sk|ghp)[-_][A-Za-z0-9_-]{8,}/g, "[Schlüssel entfernt]")
    .replace(/Bearer\s+\S+/gi, "Bearer [entfernt]")
    .slice(0, HOECHSTLAENGE);
}

/**
 * Die Projektkennung aus einer Neon-Absage herausziehen.
 *
 * Neon kennt eine dritte Sorte Schlüssel, die in der Dokumentation zu
 * `/projects` nicht vorkommt: einen **projektgebundenen**. Der darf gar keine
 * Liste abrufen — dafür nennt er beim Ablehnen sein Projekt:
 *
 *     not allowed to perform actions outside the project this key is scoped
 *     to; subject_project_id:"damp-dream-67070160"
 *
 * Das ist die vollständige Antwort auf „welches Projekt?", nur in Form einer
 * Fehlermeldung. Sie zu lesen, statt den Menschen nach etwas zu fragen, das
 * der Dienst gerade gesagt hat, ist der kürzere Weg.
 *
 * Eine Projektkennung ist kein Geheimnis — sie steht in jeder Neon-URL.
 */
export function projektAusAbsage(text: string): string | undefined {
  const treffer = /subject_project_id:\s*\\?"([a-z0-9-]+)\\?"/i.exec(text);
  return treffer?.[1];
}
