# CHATHUB.md — Der Chathub

Der Chathub ist die einzige Oberfläche, die der Nutzer bedient. Alles andere
läuft im Hintergrund.

## Leitsatz

**Der Nutzer beschreibt. BYB baut. BYB greift an. BYB berichtet.**

Der Nutzer trifft im gesamten Ablauf **genau drei Entscheidungen**:
1. Plan bestätigen
2. Veröffentlichung freigeben
3. Domain verbinden (optional, jederzeit nachholbar)

Alles darüber hinaus ist ein Fehler im Produkt, kein Feature.

## Was der Nutzer nie gefragt wird

Framework, Datenbank, Hosting, Ordnerstruktur, Auth-Anbieter, Umgebungs-
variablen, Paketmanager, Branch-Namen. Wenn eine dieser Fragen im Interface
auftaucht, hat BYB versagt.

## Zustände

| # | Zustand | Was der Nutzer sieht | Was er tut |
|---|---|---|---|
| 0 | Einstieg | Ein Feld: „Beschreibe dein Unternehmen." | schreibt oder spricht |
| 1 | Verstanden | BYB spiegelt in 3–5 Sätzen, was es verstanden hat | korrigiert oder bestätigt |
| 2 | Plan | Checkliste: Produkt, Backend, Zahlungen, Oberfläche, Prüfung, Veröffentlichung | **bestätigt einmal** |
| 3 | Bau läuft | Fortschritt je Punkt, geschätzte Restzeit, „du kannst das Fenster schließen" | nichts |
| 4 | Prüfprotokoll | Was angegriffen wurde, was gefunden, was behoben, was offen | liest |
| 5 | Freigabe | Vorschau + ein Knopf | **gibt frei** |
| 6 | Live | Adresse, Protokoll, nächste Schritte | optional Domain |

Zustand 3 und 4 laufen **ohne den Nutzer**. Bei jedem Zustandswechsel geht eine
Benachrichtigung raus (E-Mail, später Push). Das ist das Kernversprechen: er
schläft, es wird gebaut.

## Das Prüfprotokoll (Zustand 4)

Das ist der Bildschirm, wegen dem Leute BYB nehmen und nicht Lovable. Er zeigt
**Beweise, keine Beruhigung**:

- Jede Prüfkategorie mit Ergebnis: geprüft / gefunden / behoben / offen
- Jeder Fund im Klartext: was war möglich, was hätte es bedeutet, was wurde
  geändert. Ein Satz pro Fund, für Nicht-Techniker verständlich.
- Offene Punkte werden **gezeigt**, nicht versteckt. Ein Protokoll ohne offene
  Punkte ist verdächtig, kein Erfolg.
- Formulierung immer: „geprüft auf X, gefunden Y, behoben Z". Nie „sicher".

## Eingabe

Ein Feld. Text oder Sprache. Kein Formular, keine Vorlagen-Galerie, kein
Assistent mit sieben Schritten. Beim ersten Besuch drei Beispielsätze als
anklickbare Starthilfe — danach nie wieder.

## Nicht in Version 1

Werbespots, Meta-Ads, Higgsfield, mobile Apps, Teams und Rollen, mehrere
Projekte parallel, automatische Domain-Registrierung.

Version 1 ist: **eine Beschreibung rein, eine geprüfte, veröffentlichte Web-App
raus, mit Protokoll.** Nichts sonst.

## Sprache im Interface

Deutsch, Du-Form, Kleinschreibung nur wo grammatisch korrekt. Aktiv statt
passiv: „Veröffentlichen", nicht „Absenden". Ein Wort behält seine Bedeutung
durch den ganzen Ablauf: Der Knopf heißt „Veröffentlichen", die Meldung danach
heißt „Veröffentlicht". Fehler erklären, was passiert ist und was jetzt zu tun
ist — sie entschuldigen sich nicht.
