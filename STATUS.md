# STATUS.md — Stand und offene Fragen

Stand: **M1.8 Surface v1 liegt auf `main` (`91ce0fe`). Der Produktcheck Idee → Landing → Lead ist hinter Login gesperrt, bis `BYB_ALLOW_UNPAID_SURFACE=1` auf Vercel gesetzt ist.**

- M0.5 / PR #7: `main` (`234dbe33`)
- M0.6 / PR #8: `main` (`8776c66d`)
- M0.7 / PR #9: `main` (`c5a7336a`)
- M0.8 / PR #10: `main` (`95015e15`)
- M0.9 / PR #11: `main` (`197fc981`)
- M1.0 / PR #12: `main` (`72b25de1`)
- M1.1 / PR #13: `main` (`407a8713`)
- M1.2 / PR #14: `main` (`8bc733ce`)
- M1.3 / PR #15: `main` (`c3be3765`)
- M1.4 / PR #16: `main` (`7fac6491`)
- M1.5 / PR #17: `main` (`d643cca3`)
- Post-Merge-Status / PR #18: `main` (`3f3dc071`)
- M1.6 / PR #19: `main` (`b80ff240`)
- M1.7 / PR #20: `main` (`14c44e5`)
- M1.8 / PR #22: `main` (`91ce0fe`)
- Unbezahlter Surface-Produktcheck / PR (dieser Branch): `BYB_ALLOW_UNPAID_SURFACE`

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer beschreibt Ziele und Grenzen. Der interne Auftrag ist nur die dauerhafte Ausführungs- und Wiederaufnahme-Infrastruktur unter dem Chathub.

## M1.8 — Surface v1

Eine ruhige Seite `/surface.html`: Idee eingeben, danach Landing-Vorschau, Anfragen-Aufnahme und ein Agent-Status. Der Lauf ist ein normaler BYB-Auftrag (`projekt_id = surface-v1`) mit den bestehenden Aktionen `code` / `backend` / `planen`. Kein zweites Kernsystem, kein Zahlungsfluss, kein CRM, keine Zeichenfläche.

Schritte rufen vorhandene Endpunkte nur, wenn die Umgebung sie setzt (`STUDIO_BASE_URL`, `ZEUS_BASE_URL`/`AGENT_BASE_URL`, `SCP_BASE_URL`/`ODIN_SCP_URL`). Fehlt die Umgebung, bleibt der Zustand leer und ehrlich. Es gibt keinen lokalen Prüfer und keinen erfundenen Verbrauch.

Landing-Texte kommen aus dem schnellen Modell, falls der Schlüssel da ist, sonst aus der Idee selbst. Anfragen liegen in `surface_leads` (Migration `006_surface.sql`, RLS, auf `damp-dream-67070160/production` angewendet).

Ohne Flag bleibt `/surface.html` hinter Neon Auth. Mit `BYB_ALLOW_UNPAID_SURFACE=1` darf Surface ohne Login gelesen und beschrieben werden: fehlendes Bearer wird zur synthetischen Kennung `byb-unpaid-surface`, die weiter durch `mitNutzerTransaktion` und `auth.nutzer_kennung()` läuft. RLS bleibt erzwungen, es gibt keinen Owner-Bypass. Unbezahlte Besucher teilen diesen einen Mandanten. Der Leitstand `/app.html` und `/api/auftraege` bleiben hinter dem Login.

**Tung:** nach dem Merge `BYB_ALLOW_UNPAID_SURFACE=1` auf Vercel setzen.

Offen: Flag auf Vercel setzen, danach Owner-Produktcheck; echte Agenten-/Angebots-Laufzeit und Verbrauchsmeldung.

## M1.6 — echte Produktoberfläche

Auf `main` vorhanden:

- Login führt in `/app.html`, nicht mehr in den Checkout-Hub.
- Chathub, Connector Hub, Activity Log und Account sind die Hauptoberfläche.
- `/api/connectors` zeigt nur persistierte, RLS-geschützte Verbindungs-/Ressourcenreferenzen.
- Billing liegt getrennt in `/billing.html`; rohes `null` wird nicht gezeigt.
- Top-up ist nicht Teil des Hauptleitstands und erscheint nur bei aufgebrauchtem bestehendem Credit-Konto.
- Demo-Auftrag, Fake-Zeitstempel und Fake-Belege wurden von der Landingpage entfernt.
- Impressum, Datenschutz, AGB und EULA sind sichtbar verlinkt.

Der reale Browserbefund aus M1.5 bleibt der Grund, warum der Livegang noch nicht freigegeben ist.

## M1.7 — Chathub → persistente Control Plane

PR #20 baut den ersten echten Produktfluss vom Nutzerziel zum gespeicherten BYB-Plan:

- `POST /api/auftraege` nimmt ein authentifiziertes Nutzerziel entgegen.
- Das vorhandene schnelle Modell erstellt nur einen Planentwurf; seine Ausgabe wird strikt gegen einen kleinen JSON-Vertrag validiert.
- Aktionstypen, Freigabeklassen und Credit-Schätzungen werden nicht vom Modell frei erfunden, sondern von BYB deterministisch gesetzt.
- Nur Verbindungen mit Status `verbunden` werden einer passenden Aktion zugeordnet.
- Der Auftrag wird über `auftragSpeichern()` unter dem verifizierten Neon-Auth-Mandanten gespeichert.
- `GET /api/auftraege` liest nur die letzten eigenen Aufträge unter RLS.
- Der Leitstand lädt den neuesten echten Auftrag und zeigt Plan, Aktionszustände, Credits, Freigaben und persistierte Activity-Ereignisse.
- Es werden weiterhin keine erfundenen Ausführungszustände angezeigt.

Verifizierter PR-Head vor Status-Update: `b68bab1e`.

Gates auf diesem Head:

- CI: grün
- Sprache: grün
- Geheimnisse: grün
- Control-Plane-Nachweis: grün
- Vercel Status Check: grün

Die direkte Vercel-MCP-Abfrage ist derzeit wegen fehlender Team-Scope-Autorisierung mit 403 blockiert; der GitHub/Vercel Status Check für denselben Head meldet Erfolg. Das wird nicht als eigener Runtime-Proof ausgegeben.

## Auth / Social Login

Managed Neon Auth ist produktiv aktiv. Aktuell ist nur der geteilte Google-Provider konfiguriert.

Managed Neon Auth unterstützt laut aktueller Neon-Dokumentation Google, GitHub und Vercel. GitHub/Vercel benötigen für Produktion eigene OAuth-App-Credentials. Apple wird aktuell nicht als Managed-Neon-Auth-Provider angeboten und wird deshalb nicht als funktionierende Option dargestellt.

Login-Identität und operative Unternehmens-Connectoren bleiben getrennte Dinge: Neon Auth meldet den BYB-Nutzer an; GitHub/Vercel/Neon/Supabase/Stripe/Google usw. werden danach separat als Arbeitsressourcen verbunden.

## Connector Hub

Der Vertrags- und Persistenzkern existiert bereits für GitHub, Neon, Supabase, Vercel, Stripe, Google Search Console, Google Ads, YouTube, Higgsfield, Meta Ads, TikTok Ads und Wix. Tokens, Refresh-Tokens und API-Keys gehören nicht in Auftrag oder Activity Log.

Noch offen ist das öffentliche Verbindungs-Onboarding: OAuth/App-Installation beziehungsweise providergeeignete Authentisierung, sichere Secret-Ablage, Resource Discovery und Resource Picker.

## Execution

Persistente Worker-Leases, Lease-Erneuerung, Retry und Dead Letter existieren. Ein begrenzter GitHub-Executor wurde isoliert nachgewiesen.

Noch nicht als Produktfluss geschlossen:

- kein öffentlich ausgelieferter Cloud-Worker, der neue Chathub-Aufträge dauerhaft abarbeitet,
- keine generischen Executor-Adapter für Vercel, Backend, Stripe, Google oder Growth-Provider,
- keine produktive Sandbox-Laufzeit für echte dynamische Security-Angriffe.

Bis diese Punkte geschlossen sind, bedeutet ein gespeicherter Plan ausdrücklich nicht, dass alle Aktionen bereits autonom ausgeführt werden.

## Produktionsbasis

### Neon

- Projekt `damp-dream-67070160`, Branch `production`
- Migrationen 002–006 produktiv angewendet
- Control Plane, Connector-Persistenz und Billing-/Credit-Ledger vorhanden
- Rollen `byb_app`, `byb_worker`, `byb_billing` getrennt
- FORCE RLS auf den geprüften mandantenbezogenen BYB-Tabellen
- Managed Neon Auth aktiv

### Stripe

BYB-Katalog getrennt über `application=byb` / `namespace=byb_preview_v1`:

- Starter: 20 EUR/Monat, 100 Credits
- Pro: 200 EUR/Monat, 750 Credits
- Scale: 250 EUR/Monat, 1.500 Credits
- Top-up: 25 EUR einmalig, 100 Credits

Checkout-Erzeugung wurde im M1.5-Pre-Live-Proof geprüft; keine Zahlung wurde bestätigt.

### Vercel

- Projekt `build-your-buissness`
- Systemdomain `https://build-your-buissness.vercel.app`
- Custom Domain bleibt bis nach dem erneuten vollständigen Owner-Test unangetastet.

## Rechtliche Oberfläche

Vorhanden sind erste sichtbare Fassungen für Impressum, Datenschutzhinweise, AGB und EULA mit:

Bärbel Westerop / ClarityCompassAi  
Drinhausstraße 22  
47447 Moers (Kapellen)  
clarityos.baerbelwesterop@gmail.com

Nicht bekannte Register-, Steuer-, Aufsichts- oder Unternehmensform-Angaben werden nicht erfunden. Vor öffentlichem Launch bleibt ein finaler juristischer Abgleich mit den tatsächlich aktiven Datenflüssen, Providern, Bestell- und Kündigungsprozessen erforderlich.

## Nächste Schritte bis „Owner kann alles prüfen“

1. `BYB_ALLOW_UNPAID_SURFACE=1` auf Vercel setzen, danach Idee → Landing → Lead ohne Login prüfen. Flag wieder entfernen, sobald der Check durch ist.
2. Connector-Auth-Grundlage mit sicherer Secret-Ablage und echtem Resource Picker bauen; GitHub zuerst.
3. Unterstützten Social Login sauber abschließen; mindestens GitHub zusätzlich zu E-Mail/Passwort, sofern die nötige BYB-OAuth-App produktiv konfiguriert werden kann.
4. Cloud-Worker an die persistenten Aufträge hängen und GitHub-Ausführung aus dem Chathub nachweisen.
5. Vercel + Neon/Supabase als echte Executor-Adapter ergänzen; Stripe danach hinter externer/finanzieller Freigabe.
6. Google Search Console / Indexierung und anschließend Growth-Connectoren integrieren, ohne fehlende Providerfähigkeiten vorzutäuschen.
7. Sandbox-Laufzeit wählen und Debug-/Security-Proof dort isoliert schließen.
8. Vollständigen Owner-Test auf der Systemdomain durchführen.
9. Rechtstexte final prüfen.
10. Erst danach Custom Domain und öffentlicher Livegang.
