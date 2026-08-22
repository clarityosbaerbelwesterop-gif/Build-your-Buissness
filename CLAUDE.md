# CLAUDE.md — Betriebsregeln BYB

Diese Datei wird bei jeder Session gelesen. Sie ist absichtlich kurz.
Weitere verbindliche Kontextdateien: `USER.md`, `CHATHUB.md`, `DESIGN-UI.md`,
`STATUS.md`.

## 1. Was BYB ist

**Build your Buissness ist ein autonomer AI-Business-Operator.**

Merksatz:

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet seine Systeme, wählt die Ressourcen, auf denen BYB arbeiten
darf, und beschreibt das Ziel. Danach plant, baut, verbindet, testet,
veröffentlicht, beobachtet und verbessert BYB möglichst selbstständig.

Das Zielbild umfasst die ganze Kette:

**Beschreibung → Repo → Code → Backend → Auth → Payments → Tests → Sandbox →
Debug/Security-Prüfung → Fix → Deploy → Domain → Indexierung → Werbemittel →
Ads → Monitoring → autonome Verbesserungen.**

Der Nutzer darf jederzeit eingreifen und ändern. Er soll technische
Routineentscheidungen aber nicht treffen müssen.

Das Prüfprotokoll ist **nicht das ganze Produkt**. Es ist die Audit- und
Vertrauensschicht: BYB dokumentiert nachvollziehbar, was es getan, geprüft,
gefunden, behoben oder offengelassen hat.

## 2. Nicht verhandelbar

1. **Autonomie bleibt überprüfbar.** Jede relevante Aktion bekommt einen
   Zustand, ein Ergebnis und eine verständliche Aktivitätsmeldung.
2. **Kein Prüf-Lauf ohne Protokoll.** Wenn BYB einen Debug-/Security-Lauf
   ausführt, entsteht immer ein Prüfprotokoll.
3. **Niemals „sicher" behaupten.** Erlaubt: „geprüft auf X, gefunden Y,
   behoben Z". Verboten: sicher, unhackbar, garantiert, bulletproof.
4. **Angriffe ausschließlich in BYBs eigener Sandbox** gegen die App desselben
   Laufs. Nie gegen fremde Hosts, Produktion oder echte Nutzerdaten.
5. **Keine Geheimnisse im Code, Log oder Protokoll.** Tokens und Keys liegen nur
   in den vorgesehenen Secret-Stores der verbundenen Systeme. Ein Secret im Diff
   ist ein Abbruchgrund.
6. **RLS auf jeder mandantenbezogenen Tabelle.** Ohne Policy keine Tabelle;
   Migrationen sind handgeschrieben und geprüft.
7. **Externe oder finanzielle Aktionen respektieren Freigabegrenzen.** BYB darf
   nur in dem Umfang deployen, Domains ändern, Kampagnen veröffentlichen oder
   Budget ausgeben, den der Nutzer freigegeben hat.
8. **Credits sind eine Produktgrenze.** Rechenzeit, Modellnutzung, Sandboxes und
   kostenpflichtige Agentenaktionen werden messbar und später über ein
   Abo-plus-Credits-System abgerechnet.

## 3. Systeme und Stack

| Schicht | Wahl |
|---|---|
| Repo / Source Control | GitHub |
| Hosting Control Plane | Vercel |
| Datenbank | Neon primär; Supabase als unterstützte Alternative pro Projekt |
| Payments | Stripe |
| Modelle | NVIDIA-Endpunkte, Keys in Secret-Stores |
| Sprache | TypeScript, strict |
| Werbemittel | Higgsfield, später über Connector |
| Indexierung | Google Search Console, später über Connector |
| Ads | Meta Ads / TikTok Ads, später über Connector |
| Design-Werkzeug intern | Wix — nur zum Entwerfen, nicht im Produkt |

Ein BYB-Projekt verwendet genau **einen** aktiven Backend-Anbieter. Provider-
spezifische Adapter dürfen die Control Plane nicht in Neon- oder Supabase-
Sonderlogik zerlegen.

**Offen, blockiert echte Laufzeitangriffe:** Sandbox-Laufzeit. Vercel-Funktionen
sind dafür ungeeignet. Kandidaten: Fly Machines, E2B, Modal, Render Background
Worker. Bis entschieden: keine Behauptung, dynamische Angriffe seien gelaufen.

## 4. Produktarchitektur

BYB wird in fünf Schichten gedacht:

1. **Chathub** — Ziel, Änderungen, Freigaben, Transparenz.
2. **Control Plane** — Auftrag, Plan, Aktionsgraph, Zustände, Freigaben, Credits.
3. **Connector Layer** — GitHub, Vercel, Neon/Supabase, Stripe, Google,
   Higgsfield, Meta, TikTok usw.
4. **Execution & Verification** — Modelle, Builds, Sandboxes, Tests,
   Debug/Security-Prüfung, Auto-Fix.
5. **Observation** — Activity Log, Monitoring, Incidents, Änderungen und
   später Growth-/Ads-Optimierung.

Ein Connector führt aus. **Die Control Plane entscheidet nicht heimlich an den
Connectoren vorbei.** Jede externe Aktion muss als Aktion mit Zustand,
Freigabeklasse und Ergebnis existieren.

## 5. Arbeitsweise im Repo

- Flo arbeitet ausschließlich auf dem iPad über GitHub/Cloud-Werkzeuge. Keine
  lokalen Terminal-, Docker- oder Browser-Schritte verlangen.
- Ein kohärenter Schritt = ein Feature-Branch, dann ein PR, dann Merge.
- Nie direkt auf `main`.
- Jeder PR: grüne CI, Tests für neue Logik, deutsche Beschreibung mit
  „gebaut / geprüft / offen" und sichtbarem Nutzereffekt.
- Neue Abhängigkeit nur mit Begründung.
- Keine Produktionsmigration, kein Live-Deploy, kein Kauf und kein Umschalten
  von Billing ohne ausdrückliche Freigabe für genau diesen Zustandsschritt.

## 6. Definition of Done je Schritt

Ein Schritt ist fertig, wenn:

- neue Logik getestet und alle Gates grün sind,
- kein Secret, kein `any`, kein auskommentierter Ersatzcode im Diff ist,
- `STATUS.md` den verifizierten Stand und die nächste offene Frage enthält,
- der PR beschreibt, was der Nutzer davon merkt,
- keine Produktbehauptung größer ist als der nachgewiesene technische Stand.

## 7. Wenn du unsicher bist

Nicht raten. Unsicherheit sichtbar machen, den Schritt kleiner schneiden und in
`STATUS.md` festhalten. Ein kleiner nachgewiesener Schritt ist wertvoller als
eine große erfundene Integration.
