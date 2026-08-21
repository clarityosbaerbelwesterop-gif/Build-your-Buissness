# DESIGN-UI.md — Gestaltung BYB

## Haltung

BYB sieht aus wie eine **Prüfstelle**, nicht wie ein Startup-Baukasten.
Das Vorbild ist das Prüfprotokoll einer technischen Abnahme: ein Dokument, das
gestempelt wird, mit Datum, Prüfer, Befund. Nüchtern, belegend, ernst.

Bewusst **nicht**: Verlaufsflächen, schwebende Glaskarten, Bunt-auf-Dunkel,
Neon-Akzente, Emoji in der Oberfläche, „✨ AI-powered". Das ist genau der Look,
den unsere Zielgruppe von den Werkzeugen kennt, deren Ergebnisse sie nicht mehr
vertrauen.

## Signatur

**Der Stempel.** Jeder abgeschlossene Prüfschritt bekommt einen Stempelabdruck
auf dem Protokoll — leicht rotiert, mit Zeitstempel und Prüf-ID. Das ist das
eine Element, an das sich Leute erinnern. Alles andere bleibt still.

Es gibt genau eine Bewegung im Produkt: der Stempel setzt auf, wenn ein
Prüfschritt fertig ist. Sonst keine Animationen außer Zustandsübergängen
unter 150 ms. `prefers-reduced-motion` wird respektiert.

## Farben

```
--ink        #0F1720   Grundfläche, Ruhezustand
--blueprint  #17263A   Panels, erhöhte Flächen
--paper      #E6E4DD   Protokoll- und Dokumentflächen
--stahl      #8894A3   Sekundärtext, Rahmen, Beschriftungen
--befund     #E4572E   Fund, offener Punkt, Warnung
--siegel     #3F7D5A   geprüft und behoben
```

Regeln:
- `--befund` und `--siegel` **nur** für Prüfergebnisse. Nie für Knöpfe, nie für
  Verläufe, nie dekorativ.
- Protokollflächen sind `--paper` auf `--ink`. Der Kontrast Dokument-auf-Dunkel
  ist die visuelle Grundidee: das Papier liegt auf dem Prüfstand.
- Kontrast mindestens 4.5:1 für Fließtext, 3:1 für große Schrift.

## Schrift

```
Display   Archivo, versal, eng gesperrt (-0.02em), Gewicht 600–700
Fließtext Public Sans, Gewicht 400/500
Beleg     JetBrains Mono — Logs, IDs, Zeitstempel, Codeauszüge
```

Skala: 12 / 14 / 16 / 20 / 28 / 40 / 64.
Display nur für Zustandsüberschriften und Stempel. Zahlen im Protokoll immer
mono, damit Spalten stehen.

## Raster und Form

- 8-px-Raster durchgehend. Innenabstand Panels 24, Dokumentflächen 32.
- Eckenradius: 2 px auf Dokumentflächen, 4 px auf Knöpfen. Nichts ist rund.
- Trennlinien 1 px `--stahl` bei 24 % Deckkraft — nur wo sie eine echte Grenze
  markieren, nicht als Dekoration.
- Maximale Textbreite 68 Zeichen.

## Bausteine

**Protokollzeile** — die wichtigste Komponente:
```
[Stempel]  KATEGORIE            Befund: 2   Behoben: 2   Offen: 0
           ein Satz Klartext, was möglich war und was geändert wurde
           09:14:22  ID 7f3a1c
```

**Knopf**: rechteckig, `--paper` auf `--ink` für die Hauptaktion, exakt eine
Hauptaktion pro Bildschirm. Beschriftung ist ein Verb im Infinitiv:
„Plan bestätigen", „Veröffentlichen".

**Leerer Zustand**: keine Illustration, kein Spruch. Ein Satz, was als Nächstes
zu tun ist, und das Eingabefeld.

**Fehler**: `--befund` als 2-px-Linie links, Klartext was passiert ist und was
jetzt geht. Keine Entschuldigung, keine Fehlernummer ohne Erklärung daneben.

## Qualitätsboden (ohne Ausnahme)

Bis 375 px Breite bedienbar, sichtbarer Tastaturfokus, Zustände nicht allein
über Farbe kodiert (Stempelform trägt die Bedeutung mit), Ladezustände zeigen
was gerade läuft statt eines Spinners.

## Wix

Wix dient intern zum Entwerfen und Vergleichen von Layouts. **Nichts von Wix
geht in das Produkt** — kein Export, keine Vorlage, kein Einbetten. Was hier
steht, gewinnt gegen jede Wix-Vorlage.
