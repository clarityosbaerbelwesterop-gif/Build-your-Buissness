# STATUS.md — Stand und offene Fragen

Stand: **M1.5 ist auf `main` gemergt und der Owner-Live-Test ist auf der stabilen BYB-Systemdomain freigegeben.**

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

## Produktkern

**Build your Buissness ist ein autonomer AI-Business-Operator.**

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer verbindet Unternehmenssysteme und wählt die konkreten Ressourcen,
auf denen BYB arbeiten darf. Der interne Auftrag ist Ausführungs- und
Wiederaufnahme-Infrastruktur, nicht die primäre Nutzeroberfläche.

## Produktionsbasis

### Neon

- Projekt `damp-dream-67070160`, Branch `production`
- Migrationen 002–005 produktiv angewendet
- Control Plane, Connector-Persistenz, Billing-/Credit-Ledger vorhanden
- Rollen `byb_app`, `byb_worker`, `byb_billing` getrennt
- FORCE RLS auf den sieben geprüften mandantenbezogenen BYB-Tabellen
- Managed Neon Auth aktiv
- `https://build-your-buissness.vercel.app` als Trusted Origin
- E-Mail/Passwort aktiv; Google Shared OAuth vorhanden

Der Production-Pre-Live-Proof erzeugte einen kurzlebigen Testnutzer und räumte
ihn anschließend wieder auf. Danach wurden geprüft:

- `0` verbliebene `byb-prelive-*`-Testnutzer
- `0` verwaiste Billing-Konten
- `0` verwaiste Credit-Konten

### Stripe

Der BYB-Katalog ist vom Altbestand über `application=byb` und
`namespace=byb_preview_v1` getrennt.

Für den kontrollierten Owner-Live-Test sind alle vier BYB-Produkte im
vorhandenen Live-Stripe-Konto aktiv. Die im Repo hinterlegten Price-IDs wurden
gegen Stripe gelesen und stimmen bei Betrag, Typ, Intervall, Credits,
Lookup-Key und Produktzuordnung:

- Starter: 20 EUR/Monat, 100 Credits
- Pro: 200 EUR/Monat, 750 Credits
- Scale: 250 EUR/Monat, 1.500 Credits
- Top-up: 25 EUR einmalig, 100 Credits

Produktiver BYB-Webhook:
`https://build-your-buissness.vercel.app/api/stripe-webhook`

Der reale Production-Proof erzeugte für einen kurzlebigen Testnutzer alle vier
Checkout-Sessions erfolgreich. Stripe bestätigte danach die Sessions als
`open` und `unpaid`; es wurde keine Zahlung bestätigt.

### Vercel

- Projekt `build-your-buissness`
- ID `prj_VB7ToSJE6spWofEKZRjVyC0d6rOL`
- stabile Systemdomain `https://build-your-buissness.vercel.app`
- Production-Deploy `dpl_GSmHMsf5UcHSoBESTKqUgEjxhaM4` aus M1.5-Commit `d643cca3` ist READY
- `/login.html` liefert nach dem M1.5-Merge HTTP 200
- `/api/billing` liefert ohne JWT kontrolliert HTTP 401
- `/api/stripe-webhook` weist GET kontrolliert mit HTTP 405 ab
- auf dem neuen M1.5-Production-Deploy wurden im abschließenden Prüfzeitraum keine 5xx gefunden

Frühere Timeout-Cluster gehörten zu einem älteren Deployment und wurden nicht
dem aktuellen Production-Deploy zugerechnet.

Custom Domain bleibt bis nach dem Owner-Live-Test unangetastet.

## M1.4 — First-Party Auth und Billing-Testoberfläche

PR #16 ist gemergt.

`/api/auth` ist eine Same-Origin-Grenze vor Managed Neon Auth und erlaubt nur
Registrierung, Anmeldung, Sitzung, JWT und Abmeldung. Fremde Browser-Origins
werden abgelehnt; Session-Cookies bleiben first-party auf der BYB-Domain.

`/login.html` bietet:

- Registrieren / Anmelden / Abmelden
- kurzlebiges JWT erneuern
- RLS-geschützten Billing-Stand lesen
- Starter-/Pro-/Scale-Checkout öffnen
- Top-up-Checkout öffnen

### Echter Production-Proof

Der erfolgreiche GitHub-Actions-Proof gegen die stabile BYB-Systemdomain hat
nachgewiesen:

1. Registrierung eines zufälligen Kurzzeitnutzers
2. gültige Session und JWT-Ausgabe
3. RLS-geschützter `/api/billing`-Read mit HTTP 200
4. Starter-Checkout erzeugt
5. Pro-Checkout erzeugt
6. Scale-Checkout erzeugt
7. Top-up-Checkout erzeugt
8. keine Zahlung bestätigt
9. Testnutzer im Cleanup aus Neon Auth entfernt

Der Proof-Workflow bleibt ausschließlich manuell ausführbar, damit normale
PR-Synchronisationen keine weiteren Live-Checkout-Sessions erzeugen.

## M1.5 — begrenzte Worker-Retries und Dead Letter

PR #17 ist als `d643cca3` nach `main` gemergt.

- Executor-Fehler werden abgefangen und über `entschaerfen()` für das Activity
  Log gekürzt und von bekannten Secret-Mustern bereinigt.
- Standardgrenze: drei Versuche.
- Vor Erreichen der Grenze wird die laufende Aktion atomar auf `geplant`
  zurückgesetzt, das Lease entfernt und die Wiederholung protokolliert.
- Beim ausgeschöpften Versuch werden Aktion und Auftrag terminal auf
  `fehlgeschlagen` gesetzt.
- Der terminale Zustand ist das Dead Letter des Auftrags und bleibt mit
  Versuchszahl und Fehlerbeleg sichtbar.
- Fehlerübergang, Lease-Freigabe und Activity Log laufen in derselben
  `byb_worker`-Transaktion.

### Echter Neon-Nachweis

`db/worker-fehler-nachweis.ts` läuft im bestehenden Control-Plane-Gate gegen
einen frischen kurzlebigen Neon-Zweig und prüft persistent:

- Fehlversuch 1 → wieder eingeplant
- Fehlversuch 2 → wieder eingeplant
- Fehlversuch 3 → terminal `fehlgeschlagen`
- Projektion enthält `versuche = 3`
- Lease-Token, Lease-Ablauf und Lease-Owner sind danach geräumt
- Activity Log enthält zwei Retry-Ereignisse und ein terminales Fehlerereignis
- der Testzweig wird anschließend gelöscht

Der finale PR-Head bestand CI, Secret-, Sprach-, RLS-, Backend-, Connector-
Persistenz-, Control-Plane- und GitHub-Connector-Nachweis. Der reale Retry-
Nachweis und der bestehende Lease-/RLS-/Mandantenproof waren grün.

## Connector Hub

Persistiert sind Connection- und Resource-Picks, unter anderem für GitHub,
Neon/Supabase, Vercel, Stripe, Wix und spätere Growth-Provider. Tokens,
Refresh-Tokens und API-Keys werden nicht in der Control Plane gespeichert.

Der isolierte echte GitHub-Branch-Write-Proof ist vorhanden. Die in ChatGPT
verbundenen GitHub-/Vercel-/Neon-/Stripe-/Wix-Konten dienen nur der aktuellen
Owner-/Entwicklungsarbeit und werden nicht als exportierbare BYB-
Produktcredentials ausgegeben.

Für öffentliches Nutzer-Onboarding fehlen weiterhin BYB-eigene Provider-OAuth-
Apps/Credentials und die vollständige Resource Discovery für die jeweiligen
Provider. Das blockiert nicht den aktuellen Owner-Live-Test der bereits
verbundenen Produktionsbasis, ist aber vor einem öffentlichen Launch zu
schließen.

## Wix

Wix bleibt gemäß `DESIGN-UI.md` ausschließlich internes Design-/Vergleichswerkzeug
und ist keine Production-Abhängigkeit. Im verbundenen Wix-Konto existiert keine
BYB-Site; vorhandene fremde/andere Sites wurden deshalb nicht verändert.

Der frühere direkte Import einer normalen Vercel-Seiten-URL war kein gültiger
Wix-Design-Bundle-Import. Für den Owner-Live-Test ist kein Wix-Write erforderlich.

## Owner-Live-Test: READY

Der Owner-Live-Test ist auf
`https://build-your-buissness.vercel.app/login.html` freigegeben.

Zu testen ist die sichtbare Kette:

1. Registrierung / Login
2. Session / Logout / erneuter Login
3. Billing-Stand
4. Starter-, Pro-, Scale- und Top-up-Checkout bis zur Stripe-Zahlseite
5. keine echte Zahlung, außer sie wird bewusst als separater Finanztest ausgelöst

## Bewusst danach

Nach bestandenem Owner-Live-Test:

1. Custom Domain
2. Search Console / Indexierung
3. Werbespots und Creatives für **BYB selbst**
4. anschließend Meta/TikTok/YouTube/Google-Ads-Betrieb für BYB

Vor einem öffentlichen Nutzerlaunch zusätzlich:

- BYB-eigene OAuth-/Provider-App-Credentials und Resource Discovery
- dauerhafter Cloud-Worker mit diesen Produktcredentials
- echte isolierte Sandbox-Laufzeit für dynamische Debug-/Security-Angriffe

Bis eine isolierte Sandbox existiert, werden dynamische Angriffstests nicht als
durchgeführt ausgewiesen.
