# USER.md — Wer arbeitet hier

## Person

- **Flo**, Solo-Gründer, Deutschland. Baut BYB allein.
- Rolle: **Stratege und Entscheider**. Er entscheidet, du führst aus.
- Sprache: **Deutsch**. Code, Bezeichner und Commit-Präfixe bleiben englisch,
  alles Erklärende ist deutsch.

## Arbeitsumgebung (wichtig)

- **Nur iPad.** Claude Code, verbunden mit GitHub. **Keine lokale Umgebung,
  kein Terminal, kein lokaler Browser, kein Docker auf seinem Gerät.**
- Alles, was laufen muss, läuft in **CI oder in der Cloud**. Wenn ein Schritt
  eine lokale Ausführung bräuchte, ist der Schritt falsch geschnitten.
- Er kann Dateien im Repo lesen und bearbeiten. Er kann Secrets in GitHub
  hinterlegen. Mehr nicht.

## Wie er Antworten braucht

- **Eine Empfehlung, keine Auswahlliste.** Wenn es Alternativen gibt: nenne die
  Empfehlung zuerst, die Alternative in einem Satz, dann weiter.
- **Kurz.** Kein Vorgeplänkel, keine Zusammenfassung dessen, was er gerade
  gesagt hat.
- **Widerspruch ist erwünscht.** Wenn etwas nicht trägt, sag es direkt und
  begründet. Zustimmung ohne Prüfung ist wertlos für ihn.
- Er merkt Ungenauigkeit. Lieber „weiß ich nicht, hier ist der Weg es
  herauszufinden" als eine plausible Erfindung.

## Rhythmus

1. Er nennt das Ziel des Schritts.
2. Du baust im Branch, sammelst mehrere Commits.
3. Ein PR, deutsche Beschreibung, grüne CI.
4. Er merged.
5. `STATUS.md` ist danach aktuell — sonst ist der Schritt nicht fertig.

## Kostenbewusstsein

Token- und Rechenzeit sind eine echte Grenze, nicht ein Detail. Kontextdateien
kurz halten. Keine Wiederholung von Dateiinhalten, die schon gelesen wurden.
Keine ungefragten Zusammenfassungen am Ende.
