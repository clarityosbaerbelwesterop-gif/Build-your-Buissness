# CLAUDE.md — Betriebsregeln BYB

Diese Datei wird bei jeder Session gelesen. Sie ist absichtlich kurz.
Weitere Kontextdateien: `USER.md`, `CHATHUB.md`, `DESIGN-UI.md`.

## 1. Was BYB ist

BYB baut aus einer Beschreibung ein lauffähiges Produkt — und **greift es
während des Bauens in einer Sandbox selbst an**, findet Lücken und behebt sie,
bevor irgendetwas live geht. Das Ergebnis jedes Laufs ist ein **Prüfprotokoll**:
was versucht wurde, was gefunden wurde, was behoben wurde.

Das Prüfprotokoll ist das Produkt. Alles andere ist Beiwerk.

## 2. Nicht verhandelbar

1. **Kein Lauf ohne Protokoll.** Jeder Build erzeugt ein Prüfprotokoll, auch
   wenn nichts gefunden wurde. Ein leeres Protokoll ist ein gültiges Ergebnis,
   ein fehlendes ist ein Fehler.
2. **Niemals „sicher" behaupten.** Erlaubte Formulierung: „geprüft auf X,
   gefunden Y, behoben Z". Verboten: sicher, unhackbar, garantiert, bulletproof.
   Gilt in Code, Kommentaren, Commit-Messages, UI-Texten und Marketing.
3. **Angriffe laufen ausschließlich in der eigenen Sandbox**, gegen die App, die
   im selben Lauf gebaut wurde. Nie gegen fremde Hosts, nie gegen Produktion,
   nie gegen etwas mit echten Nutzerdaten.
4. **Keine Geheimnisse im Code.** Keys kommen aus GitHub Secrets (CI) bzw. den
   Vercel-Umgebungsvariablen (Laufzeit). Ein Key im Diff ist ein Abbruchgrund.
5. **Row Level Security auf jeder Tabelle mit Mandantenbezug.** Ohne Policy
   keine Tabelle. Migration nur handgeschrieben und geprüft.

## 3. Stack (entschieden — nicht neu diskutieren)

| Schicht | Wahl |
|---|---|
| Datenbank | Neon (Postgres, Branching pro Lauf) |
| Hosting Control Plane | Vercel |
| Payments | Stripe |
| Modelle | NVIDIA-Endpunkte, Keys in GitHub Secrets |
| Sprache | TypeScript, strict |
| Design-Werkzeug (intern) | Wix — nur zur Gestaltung, nicht im Produkt |

**Offen, blockiert M1:** Laufzeit für die Sandbox. Vercel-Funktionen sind dafür
ungeeignet (Laufzeitlimit, keine Netz- und Prozesskontrolle). Kandidaten: Fly
Machines, E2B, Modal, Render Background Worker. Bis entschieden: keine Arbeit
an der Live-Sandbox, nur an statischen Prüfungen.

## 4. Arbeitsweise

- Flo arbeitet **ausschließlich auf dem iPad über Claude Code + GitHub**. Es gibt
  keine lokale Umgebung. Niemals Anweisungen geben wie „führe lokal aus",
  „öffne den Browser", „installiere auf deinem Rechner".
- Schritte werden in **einem Branch gesammelt, dann ein PR, dann gemergt**.
  Nie direkt auf `main`.
- Jeder PR: grüne CI, Tests für neue Logik, kurze deutsche Beschreibung mit
  „gebaut / geprüft / offen".
- Neue Abhängigkeit nur mit einem Satz Begründung im PR.

## 5. Definition of Done je Schritt

Ein Schritt ist fertig, wenn:
- die Tests grün sind und die neue Logik abgedeckt ist,
- kein Secret, kein `any`, kein auskommentierter Code im Diff ist,
- `STATUS.md` den neuen Stand und die nächste offene Frage enthält,
- der PR erklärt, was ein Nutzer davon merkt.

## 6. Wenn du unsicher bist

Nicht raten. In `STATUS.md` unter „Offene Fragen" schreiben und den Schritt
kleiner schneiden. Ein halber Schritt, der stimmt, ist mehr wert als ein ganzer,
der geraten ist.
