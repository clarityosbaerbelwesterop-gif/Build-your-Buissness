# STATUS.md — Stand und offene Fragen

Stand: **M1.2 ist auf `main`; M1.3 ist in PR #15 gebaut und der Live-Runtime-Sync wurde real nachgewiesen.**

- M0.5 / PR #7: `main` (`234dbe33`)
- M0.6 / PR #8: `main` (`8776c66d`)
- M0.7 / PR #9: `main` (`c5a7336a`)
- M0.8 / PR #10: `main` (`95015e15`)
- M0.9 / PR #11: `main` (`197fc981`)
- M1.0 / PR #12: `main` (`72b25de1`)
- M1.1 / PR #13: `main` (`407a8713`)
- M1.2 / PR #14: `main` (`8bc733ce`)
- M1.3: Branch `m13-live-runtime-sync`, PR #15.

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet Unternehmenssysteme und wählt die konkreten Ressourcen,
auf denen BYB arbeiten darf. Der interne Auftrag ist Ausführungs- und
Wiederaufnahme-Infrastruktur, nicht die primäre Nutzeroberfläche.

## Auf `main` bereits vorhanden

### Control Plane und Worker

- persistente Aufträge, Aktionen und Activity Log
- Approval- und Credit-Grenzen
- Worker-Leases mit Ablauf, Erneuerung und sicherem Abschluss
- Worker leasen nur Aktionstypen, für die ein Executor registriert ist
- isolierter realer GitHub-Branch-Write-Proof wurde erfolgreich ausgeführt

### Connector Hub

Modelliert sind unter anderem GitHub, Neon/Supabase, Vercel, Stripe,
Higgsfield, Meta Ads, TikTok Ads, YouTube, Google Ads, Search Console und Wix.

Persistiert werden ausschließlich Connection-/Resource-Referenzen. OAuth-
Tokens, Refresh-Tokens, API-Keys und Provider-Secrets gehören nicht in die
Control Plane.

Die Tabellen `connector_verbindungen` und `connector_projekt_werkzeuge` sind
RLS-geschützt. `byb_worker` darf Connector-Picks nur lesen, nicht umschreiben.

### Neon Production

Projekt: `damp-dream-67070160`, Branch `production`.

Migrationen 002–005 sind produktiv angewendet. Vorhanden sind unter anderem:

- Control-Plane-Tabellen
- Connector-Persistenz
- Billing-Konten und Abos
- Credit-Konten und Credit-Buchungen
- idempotente Stripe-Webhook-Ereignisse
- `byb_app`, `byb_worker`, `byb_billing` mit getrennten Rechten
- FORCE RLS auf den mandantenbezogenen BYB-Tabellen
- Managed Neon Auth

Neon Auth erlaubt inzwischen die stabile BYB-Systemdomain
`https://build-your-buissness.vercel.app` als Trusted Origin. Google OAuth ist
über Neons Shared Provider vorhanden; E-Mail/Passwort-Anmeldung ist aktiviert.

### Stripe Billing und Credits

Der BYB-Katalog ist strikt von vorhandenen älteren Stripe-Produkten getrennt.
BYB-Objekte tragen den Namespace `byb_preview_v1` / `application=byb`.

Aktuelle Preise:

- Starter: 20 EUR/Monat, 100 Credits
- Pro: 200 EUR/Monat, 750 Credits
- Scale: 250 EUR/Monat, 1.500 Credits
- Top-up: 25 EUR einmalig, 100 Credits

Der Backend-Pfad verarbeitet BYB-Checkout-/Invoice-/Subscription-Events und
schreibt Credits idempotent nach Neon. Fremde Stripe-Produkte werden ignoriert.

Der produktive BYB-Webhook `we_1U7YtQEmDA2oLCportbRSUaX` zeigt auf:

`https://build-your-buissness.vercel.app/api/stripe-webhook`

Er empfängt ausschließlich:

- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Alte Stripe-Webhooks anderer Projekte wurden nicht verändert.

## M1.3 — Live-Runtime und Secret-Sync

PR #15 korrigiert die Vercel-API-Routen auf Method-Handler (`GET`/`POST`) und
enthält einen Regressionstest dafür.

Der dauerhafte Workflow `.github/workflows/vercel-preview.yml` ist
**workflow_dispatch-only**. Er:

1. prüft die freigegebenen GitHub-Secrets und Ziel-IDs,
2. leitet `DATABASE_URL` und Neon-Auth Base/JWKS aus dem freigegebenen Neon-
   Projekt ab,
3. prüft/ergänzt die BYB-Vercel-Origin in Neon Auth,
4. synchronisiert nur die benötigten Runtime-Secrets per Vercel REST API in
   Preview + Production des Projekts `build-your-buissness`,
5. erzeugt anschließend einen Preview-Deploy aus dem freigegebenen Git-Head.

`NEON_API_KEY` wird nicht in die Vercel-Web-Runtime kopiert. Der Stripe-
Repository-Secretname `STRIPE_SIGNATURE_SECRET` wird ausschließlich als
Runtime-Variable `STRIPE_WEBHOOK_SECRET` gespiegelt.

### Realer Sync-Proof

Für genau einen kontrollierten Nachweis gab es vorübergehend einen auf PR #15
und denselben Repository-Branch begrenzten `pull_request`-Trigger. Er wird vor
dem Merge nicht im finalen Workflow behalten.

Erster Versuch: sicher vor Vercel-Writes abgebrochen, weil Neon wegen mehrerer
Rollen eine explizite DB-Rolle verlangte.

Zweiter Versuch: Neon-Konfiguration und Auth-Domain erfolgreich; Vercel-CLI-
Projektlink scheiterte vor Secret-Writes.

Finaler Proof auf Commit `6178a665`:

- CI: grün
- Lint: grün
- TypeScript: grün
- Vitest: **30 Dateien / 278 Tests grün**
- Secret-Preflight: benötigte GitHub-Secrets gesetzt
- Neon Runtime-Konfiguration: erfolgreich aufgelöst
- Neon Auth Trusted Origin: erfolgreich geprüft
- Vercel Runtime-Secrets: **Preview + Production erfolgreich synchronisiert**
- Vercel Preview: **READY**
- Secret-Werte wurden nicht in Repo oder Workflow-Ausgabe geschrieben

Der finale Workflow ist wieder manuell-only und verwendet für Vercel-Env-Writes
die projektspezifische REST API statt eines lokalen CLI-Linkzustands.

## Vercel

Kostenloser Hobby-Plan; keine kostenpflichtigen Zusatzfunktionen wurden von BYB
aktiviert.

Zielprojekt:

- Name: `build-your-buissness`
- ID: `prj_VB7ToSJE6spWofEKZRjVyC0d6rOL`
- GitHub: `clarityosbaerbelwesterop-gif/Build-your-Buissness`
- stabile System-/Vorschaudomain: `https://build-your-buissness.vercel.app`

Die Custom Domain bleibt bis zum finalen Produktabschluss unangetastet.

## Noch offen

### 1. Nutzer-Auth vollständig in der Oberfläche

Neon Auth ist backendseitig vorhanden und die Vercel-Origin ist freigegeben.
Die Landingpage besitzt aktuell aber noch keinen vollständigen Sign-up/Login-
Flow, der ein Neon-Auth-JWT in die Browser-Session übernimmt. Checkout verlangt
bereits ein verifiziertes JWT und bleibt ohne Login absichtlich geschlossen.

### 2. Echte Nutzer-Connectoren

Connection-/Resource-Persistenz steht. Noch fehlen die vollständigen
OAuth-/Credential-Flows und Resource Discovery für die echten Nutzerkonten,
insbesondere GitHub, Vercel, Neon/Supabase, Stripe und danach Growth-Provider.

### 3. Vollständiger Worker-Betrieb

Noch fehlen begrenzte Retries, Fehlerklassifikation, Dead-Letter-Zustand und
eine dauerhaft laufende Cloud-Worker-Runtime. Der GitHub-Write ist bisher ein
isolierter Proof, kein vollständiger autonomer Produktbetrieb.

### 4. Wix-Designquelle

Eine eigene BYB-Wix-Site ist noch nicht erzeugt. Wix bleibt gemäß `DESIGN-UI.md`
Design-/Vergleichswerkzeug; Wix-Code wird nicht als Produktcode übernommen.
Visuell freigegebene Konzepte werden sauber im BYB/Vercel-Code umgesetzt.

### 5. Pre-Live-End-to-End-Test

Vor Custom Domain und Indexierung müssen mindestens diese realen Pfade grün
sein:

- Sign-up/Login → gültiges Neon-JWT
- Nutzer-RLS und Billing-Read
- Starter/Pro/Scale Checkout
- einmaliger Top-up
- Stripe-Webhook → idempotentes Credit-Ledger
- Connector wählen → Auftrag → Worker → Ergebnis/Activity Log
- Vercel Production ohne Runtime-5xx
- vollständiger Debug-/Security-Test

### 6. Später, bewusst noch nicht

- Custom Domain
- Search Console / Indexierung
- Higgsfield-Werbemittel und Ads-Publishing
- Meta/TikTok/YouTube/Google-Ads-Betrieb

Diese Schritte kommen erst nach dem vollständigen Live-Test.

## Nächste Umsetzung

1. PR #15 sauber abschließen und mergen.
2. Production-Deployment auf der stabilen `.vercel.app`-Domain prüfen.
3. Nutzer-Auth-UI mit Neon Auth schließen und Checkout/Billing E2E testen.
4. Kern-Connectoren als echte Nutzerverbindungen bauen: GitHub → Neon/Supabase → Vercel → Stripe.
5. Wix-BYB-Design erzeugen und visuell gegen die Vercel-Landingpage prüfen.
6. Worker-Retry/Failure-Semantik + realen vollständigen Auftragspfad schließen.
7. Pre-Live-/Security-Test; erst danach Custom Domain, Indexierung und Werbung.
