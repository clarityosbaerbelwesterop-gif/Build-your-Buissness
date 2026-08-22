# STATUS.md — Stand und offene Fragen

Stand: **M1.0 ist in PR #12 gebaut und nachgewiesen.**

- M0.5 / PR #7 ist in `main` (`234dbe33`).
- M0.6 / PR #8 ist in `main` (`8776c66d`).
- M0.7 / PR #9 ist in `main` (`c5a7336a`).
- M0.8 / PR #10 ist in `main` (`95015e15`).
- M0.9 / PR #11 ist in `main` (`197fc981`).
- M1.0 liegt auf `m10-connector-hub-github-executor`; PR #12 ist noch nicht gemergt.
- Auf dem geprüften M1.0-Head `9b7beff5` sind CI, Geheimnisse, Sprache,
  Backend-Nachweis, Control-Plane-Nachweis und GitHub-Connector-Nachweis grün.
- CI: **23 Testdateien / 251 Tests**, Lint und TypeScript grün,
  `npm audit --audit-level=high`: **0 bekannte Schwachstellen**.

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer soll nicht technische Aufträge verwalten. Er beschreibt ein Ziel und
verbindet einmal die Systeme, auf denen BYB arbeiten darf. Der interne Auftrag
ist nur die persistente Arbeitseinheit, mit der BYB Ausführung, Wiederaufnahme,
Fehler, Credits und Activity nachvollziehbar macht.

## Bedienmodell des Connector Hubs

Der Nutzer verbindet einen Anbieter per OAuth, MCP oder einem passenden
anbieterabhängigen Credential-Verfahren. Danach lädt BYB die verfügbaren
Ressourcen und der Nutzer wählt konkret aus, welche Ressource BYB verwenden darf.

Der aktuell modellierte Zielzustand ist:

- **GitHub** → Repository auswählen
- **Neon oder Supabase** → genau ein Backend-Projekt auswählen
- **Vercel** → Projekt auswählen
- **Stripe** → Payment-Konto auswählen
- **Higgsfield** → Workspace für Werbemittel auswählen
- **Meta Ads** → Werbekonto als Veröffentlichungsziel auswählen
- **TikTok Ads** → Werbekonto als Veröffentlichungsziel auswählen
- **YouTube** → Kanal als Veröffentlichungsziel auswählen
- **Google Ads** → Werbekonto als Veröffentlichungsziel auswählen
- **Google Search Console** → Property für Indexierung auswählen
- **Wix** → Site für Landingpage-Arbeit auswählen

Secrets, Access-Tokens und Refresh-Tokens gehören **nicht** in den
Control-Plane-/Connector-Datensatz. Dort liegen nur stabile Konto- und
Ressourcenreferenzen. Echte Credentials bleiben in GitHub Secrets bzw. später
im dafür vorgesehenen Connector-Secret-Store.

## M1.0 — Connector Hub v1

`connector-hub/v1.ts` führt einen strikten Vertrag für Verbindungen,
Ressourcen und die konkrete Werkzeugauswahl ein.

Ein Unternehmens-Setup enthält aktuell:

1. GitHub-Repo
2. genau ein Backend: Neon **oder** Supabase
3. Vercel-Projekt
4. optional Stripe
5. optional Search Console
6. optional Wix
7. optional Werbung: Higgsfield als Creative-Quelle plus mindestens ein
   Veröffentlichungsziel aus Meta Ads, TikTok Ads, YouTube oder Google Ads

`werkzeugeAufloesen()` prüft, dass jede ausgewählte Ressource tatsächlich zur
gewählten Verbindung gehört, dass der Anbieter stimmt und dass die Verbindung
arbeitsbereit ist. Doppelte Werbeziele werden abgelehnt.

Der Vertrag ist `.strict()`: unbekannte Felder wie rohe Tokens werden nicht
angenommen.

## Worker-Runtime

`worker/runtime.ts` verbindet die persistente M0.9-Queue erstmals mit
Executoren:

1. Aktion leasen
2. Lease erneuern
3. passenden Executor aufrufen
4. Ergebnis und tatsächliche Credits über die aktive Lease persistent
   abschließen

M1.0 ist noch **kein dauerhaft laufender Cloud-Scheduler**. Es ist der
nachgewiesene Dispatch-Kern, auf den die späteren Connector-Executoren gesetzt
werden.

Eine bekannte Grenze bleibt absichtlich offen: Vor breitem Worker-Rollout muss
die Lease-Suche auf die vom jeweiligen Worker unterstützten Aktionstypen
begrenzt werden und es braucht Retry-/Fehler-/Dead-Letter-Zustände. Ein Worker
soll niemals eine für ihn unbekannte Aktion dauerhaft blockieren.

## Erster GitHub-Executor

`worker/github-executor.ts` kann:

- das ausgewählte `owner/repo` prüfen,
- den Standardbranch und dessen SHA auflösen,
- einen isolierten Arbeitsbranch unter `byb/...` anlegen,
- ausschließlich einen `byb/...`-Branch automatisch wieder löschen.

Der Executor schreibt ausdrücklich **nicht direkt auf `main`**.

Der automatische PR-Nachweis ist zunächst read-only. Das verhindert, dass ein
allgemeiner CI-Token versehentlich Repository-Schreibrechte für Tests bekommt.
Ein echter Branch-Write-Test folgt mit einem expliziten Connector-Credential und
einem isolierten Testbranch.

## Echter GitHub-Live-Nachweis

Der GitHub-Connector-Workflow hat auf dem echten Repository erfolgreich gelesen:

- Repository: `clarityosbaerbelwesterop-gif/Build-your-Buissness`
- Standardbranch: `main`
- Basis-Commit zum Nachweiszeitpunkt: `197fc981`

Der Workflow hat **keine Schreibaktion** ausgeführt.

`BYB_GITHUB_LIVE_TOKEN` ist aktuell nicht als Repo-Secret gesetzt. Deshalb hat
der read-only Nachweis den kurzlebigen `GITHUB_TOKEN` von GitHub Actions benutzt.
Für echte Connector-Writes und externe Provider werden explizite
Provider-Credentials/OAuth-Verbindungen verwendet; keine Schlüssel werden in
Repo oder Logs geschrieben.

## Verifikation auf M1.0-Head `9b7beff5`

- CI: grün
- Lint: grün
- TypeScript: grün
- Vitest: **23 Dateien / 251 Tests grün**
- Connector-Hub-/Worker-Lauf: **4 Dateien / 16 Tests grün**
- `npm audit --audit-level=high`: **0 bekannte Schwachstellen**
- Geheimnisse: grün
- Sprache: grün
- Backend-Nachweis: grün
- Control-Plane-Nachweis: grün
- GitHub-Connector-Nachweis inkl. echtem read-only API-Aufruf: grün

Eine erste CI-Runde in PR #12 fand ausschließlich einen strikten TypeScript-
Fehler im Testaufbau eines optionalen Werbeblocks. Der Test wurde korrigiert;
der aktuelle Head ist vollständig grün.

## Neon `production`

M1.0 hat **keine Produktionsänderung** ausgeführt.

Migration 002 und 003 wurden weiterhin nicht auf Neon `production` angewendet.
Vor einer späteren Freigabe wird der Produktionszustand erneut read-only geprüft
und die Migrationsreihenfolge 002 → 003 bewusst freigegeben.

## Festgelegte Produktreihenfolge

Die weitere Umsetzung soll bewusst in dieser Reihenfolge erfolgen:

1. Connector Hub und Resource Picker belastbar machen.
2. GitHub-Executor mit isoliertem Live-Write testen.
3. Neon/Supabase-Executor anbinden.
4. Vercel-Executor anbinden.
5. Stripe vollständig anbinden und das Abo-/Credit-/Top-up-System aufbauen.
6. Wix für die Landingpage anbinden; Landingpage anschließend in den
   kontrollierten BYB/Vercel-Codepfad übernehmen.
7. Higgsfield und Veröffentlichungsziele Meta Ads, TikTok Ads, YouTube und
   Google Ads anbinden.
8. Google Search Console erst nach dem finalen Pre-Live-Test für Indexierung
   verwenden.
9. Vor Live: vollständiger Debug-/Security-/Produkt-/Payment-Test.
10. Nach dem Livegang, aber **vor Indexierung**, noch einmal den vollständigen
    realen Live-Pfad mit freigegebenen Live-Credentials testen.
11. Erst danach Indexierung und schrittweiser Growth-/Ads-Betrieb.

Live-Credentials für Nachweise werden als GitHub Secrets bzw. über den späteren
OAuth/Connector-Secret-Store bereitgestellt. Sie werden nie in Dateien,
Commits, Testfixtures oder Klartext-Logs geschrieben.

## Noch offen

### 1. Connector-OAuth/MCP-Flows

Der gemeinsame Datenvertrag steht, aber die tatsächlichen OAuth-Flows,
Callback-Grenzen, Token-Rotation und Resource-Discovery-Adapter der einzelnen
Anbieter sind noch nicht implementiert.

### 2. Persistenz der Connector-Auswahl

Verbindungen und ausgewählte Ressourcen müssen RLS-geschützt persistiert und an
ein BYB-Projekt gebunden werden. Secret-Material bleibt davon getrennt.

### 3. Worker-Fehlergrenzen

Unterstützte Aktionstypen müssen vor dem Leasen gefiltert werden. Zusätzlich
fehlen begrenzte Retries, Fehlerklassifikation und Dead-Letter-Zustände.

### 4. Credits/Billing

Auftragsdeckel und tatsächliche Credits existieren. Vor Live fehlen noch Abo,
Wallet, Top-ups, atomare Credit-Reservierung und Stripe-Abrechnung.

### 5. Sandbox-Laufzeit

Dynamische Debug-/Security-Angriffe gegen eine isoliert laufende Kunden-App
brauchen weiterhin eine Runtime-Entscheidung.

### 6. Historische Zugangsdaten und CI-Wartung

Frühere NVIDIA-Werte liegen weiterhin im Git-Verlauf; ihr Anbieter-Widerruf ist
nicht verifiziert. Außerdem bestehen Wartungswarnungen für Actions/ESLint und
die angekündigte `pg`-SSL-Semantikänderung; aktuell ist davon kein Gate rot.

## Nächster Schritt nach Merge von PR #12

**M1.1: Connector-Persistenz + erster isolierter GitHub-Write-Proof.**

Ziel: Connector-Verbindungen und Resource Picks RLS-geschützt an ein Projekt
binden, Worker-Leases nach unterstützten Aktionstypen filtern und anschließend
mit einem expliziten GitHub-Connector-Credential einen temporären `byb/...`-
Branch anlegen, verifizieren und wieder löschen. Danach folgen Neon/Supabase und
Vercel auf demselben Adapter-Vertrag.
