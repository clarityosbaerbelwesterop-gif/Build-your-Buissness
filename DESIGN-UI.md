# DESIGN-UI.md — Gestaltung BYB

## Haltung

BYB sieht aus wie ein **ruhiger autonomer Leitstand**, nicht wie ein
Startup-Baukasten und nicht wie ein reines Security-Dashboard.

Der Nutzer soll sofort zwei Dinge verstehen:

1. **BYB arbeitet gerade für mich.**
2. **Ich kann nachvollziehen, was es tut und jederzeit eingreifen.**

Bewusst nicht: bunte AI-Deko, unlesbare Agenten-Logs, zehn Dashboards oder eine
Oberfläche, die den Nutzer zu technischen Entscheidungen zwingt.

## Visuelle Grundidee

Die Hauptfläche ist der Chathub. Daneben oder darunter lebt ein klarer
**Aktivitätsstrom**: Auftrag, Plan, laufende Aktion, Ergebnis, Freigabe und
Credits. Technische Details sind aufklappbar, aber nicht die erste Ebene.

Das Prüfprotokoll behält seine dokumentartige Gestaltung als besondere
Beweisfläche. Es ist ein Teil des Leitstands, nicht dessen gesamtes Erscheinungsbild.

## Signatur

**Der Statusbeleg.** Abgeschlossene und tatsächlich nachgewiesene Schritte dürfen
einen zurückhaltenden Stempelabdruck bekommen — leicht rotiert, mit Zeitstempel
und Aktions-ID. Ein Stempel bedeutet ausschließlich: dieser konkrete Schritt ist
belegt abgeschlossen. Er ist kein allgemeines „sicher"-Siegel.

Animationen zeigen nur Zustandswechsel oder echte laufende Arbeit. Keine
Dekorationsbewegung. `prefers-reduced-motion` wird respektiert.

## Farben

```
--ink        #0F1720   Grundfläche, Ruhezustand
--blueprint  #17263A   Panels, erhöhte Flächen
--paper      #E6E4DD   Belege, Prüfprotokolle, Freigabedetails
--stahl      #8894A3   Sekundärtext, Rahmen, Beschriftungen
--befund     #E4572E   Fund, Blockade, offene Freigabe
--siegel     #3F7D5A   nachgewiesen abgeschlossen / behoben
```

Regeln:
- `--befund` und `--siegel` tragen Bedeutung, nie Dekoration.
- Dokumentflächen sind `--paper` auf `--ink`.
- Kontrast mindestens 4.5:1 für Fließtext, 3:1 für große Schrift.

## Schrift

```
Display   Archivo, versal, eng gesperrt (-0.02em), Gewicht 600–700
Fließtext Public Sans, Gewicht 400/500
Beleg     JetBrains Mono — IDs, Zeitstempel, technische Details
```

Skala: 12 / 14 / 16 / 20 / 28 / 40 / 64.

## Raster und Form

- 8-px-Raster durchgehend.
- Innenabstand Panels 24, Dokumentflächen 32.
- Eckenradius 2–4 px; nichts ist weich-rund nur weil es „AI" ist.
- Trennlinien markieren echte Grenzen.
- Maximale Textbreite 68 Zeichen für längere Erklärungen.

## Wichtigste Bausteine

**Auftragskopf**
```
AUFTRAG 8D2F      läuft
Baue die Zahlungsseite und veröffentliche sie nach Prüfung.
Credits: 84 verbraucht · 120–160 geschätzt
```

**Aktivitätszeile**
```
[Status]  VERCEL DEPLOY       abgeschlossen
          Preview gebaut und Smoke-Test bestanden.
          09:14:22  Aktion 7f3a1c
```

**Freigabekarte**
```
VERÖFFENTLICHUNG
BYB möchte die geprüfte Fassung live schalten.
[Veröffentlichen]   [Dauerfreigabe für Deployments]
```

**Prüfzeile**
```
[Stempel]  AUTHENTIFIZIERUNG   Gefunden: 2   Behoben: 2   Offen: 0
           Ein Satz Klartext, was möglich war und was geändert wurde.
```

**Knopf**: genau eine visuell dominante Hauptaktion pro Entscheidung. Verb im
Infinitiv: „Plan bestätigen", „Veröffentlichen", „Budget freigeben".

**Laufende Arbeit**: kein anonymer Spinner. Immer benennen, was BYB gerade tut
und welcher Schritt davor/danach steht.

**Fehler/Blockade**: `--befund` als 2-px-Linie links. Klartext: was passiert ist,
was BYB bereits versucht hat, was blockiert und ob der Nutzer etwas tun muss.

## Chathub

Ein Eingabefeld für Text oder Sprache bleibt der primäre Steuerkanal. Der Nutzer
kann während eines laufenden Auftrags neue Anweisungen geben. BYB zeigt, ob die
Anweisung den aktuellen Plan ergänzt, ersetzt oder eine laufende Aktion stoppen
würde.

Keine technischen Assistenten mit sieben Formularseiten. Verbindungen wie
GitHub/Vercel/Neon/Supabase/Stripe erscheinen als kompakte Setup-Karten und
werden danach nur gezeigt, wenn Zustand oder Freigabe relevant ist.

## Credits

Credits werden ruhig, aber jederzeit auffindbar gezeigt:

- Restguthaben im globalen Rahmen
- Schätzung vor größeren Aufträgen
- tatsächlicher Verbrauch pro Aktion
- Warnung bevor ein Auftrag an einer Credit-Grenze stoppen würde

Keine künstlich blinkenden Verbrauchsanzeigen.

## Qualitätsboden

Bis 375 px Breite bedienbar, sichtbarer Tastaturfokus, Zustände nicht allein
über Farbe kodiert, Screenreader-taugliche Statusmeldungen, verständliche
Freigabedialoge und keine versteckten externen Nebenwirkungen.

## Wix

Wix dient intern zum Entwerfen und Vergleichen von Layouts. Nichts von Wix geht
in das Produkt. Was in `CHATHUB.md` und dieser Datei steht, gewinnt gegen jede
Vorlage.
