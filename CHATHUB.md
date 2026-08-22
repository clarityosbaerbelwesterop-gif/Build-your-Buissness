# CHATHUB.md — Der Chathub

Der Chathub ist die zentrale Oberfläche von BYB. Der Nutzer beschreibt Ziele,
verbindet die Systeme, auf denen BYB arbeiten darf, sieht laufende Arbeit und
kann jederzeit eingreifen. Die technische Ausführung läuft im Hintergrund.

## Leitsatz

**Der Nutzer beschreibt. BYB plant. BYB baut. BYB verbindet. BYB prüft. BYB
veröffentlicht. BYB beobachtet. BYB berichtet.**

Kurzform des Produktversprechens:

> **Vom Repo bis zum Deploy bis zum Werbespot — BYB macht alles für dich.**

Der Nutzer soll Ziele und Grenzen entscheiden, nicht Frameworks, Paketmanager
oder Infrastrukturdetails.

## Ersteinrichtung

BYB darf nur auf explizit verbundene Konten und ausgewählte Ressourcen
zugreifen. Die Ersteinrichtung ist deshalb bewusst getrennt vom normalen Chat:

- GitHub verbinden und Repo auswählen oder von BYB anlegen lassen
- Vercel verbinden und Zielprojekt auswählen oder anlegen lassen
- genau einen Backend-Anbieter verbinden: Neon **oder** Supabase
- optional Stripe verbinden
- später optional Google Search Console, Higgsfield, Meta Ads und TikTok Ads

OAuth/MCP/API-Verbindungen geben BYB die technische Fähigkeit. Die Control Plane
speichert dabei nur Verbindungs- und Ressourcenreferenzen, niemals rohe Secrets.

## Normaler Ablauf

| Zustand | Was der Nutzer sieht | Was BYB tut |
|---|---|---|
| Beschreiben | Ein Feld: „Was soll ich für dich bauen oder ändern?" | Ziel aufnehmen |
| Verstanden | kurze Spiegelung + Annahmen | Verständnis prüfen |
| Plan | verständliche Arbeitspakete, Credit-Schätzung, nötige Freigaben | Aktionsgraph bauen |
| Arbeiten | Live-Aktivitäten, aktueller Schritt, Ergebnisse, Credits | autonom ausführen |
| Prüfen | Tests, Debug-/Security-Lauf, Funde und Fixes | prüfen und nachbessern |
| Freigabe | nur wenn eine Aktion eine Freigabegrenze überschreitet | auf Freigabe warten |
| Live | Deployment, Domain, Indexierung, Betriebszustand | beobachten und weiterarbeiten |

Der Nutzer kann während **Arbeiten**, **Prüfen** und **Live** jederzeit eine neue
Anweisung geben. BYB passt den Plan an; ein laufender technischer Schritt wird
nicht stillschweigend in eine andere Bedeutung umgedeutet.

## Was der Nutzer nie gefragt wird

Framework, Ordnerstruktur, Paketmanager, Branch-Namen, konkrete
Umgebungsvariablen oder die Wahl zwischen technisch gleichwertigen
Implementierungsdetails. Wenn BYB diese Entscheidung selbst sicher treffen und
prüfen kann, trifft BYB sie.

Der Nutzer wird dagegen gefragt, wenn die Entscheidung sein Geschäft oder sein
Risiko verändert: Ziel, Preis, Budgetgrenze, Veröffentlichung, Datenquelle oder
welches externe Konto/Projekt BYB verwenden darf.

## Autonomie und Freigaben

Es gibt drei Aktionsklassen:

1. **intern** — Code schreiben, testen, analysieren, Sandbox, Entwürfe. Darf BYB
   innerhalb der verbundenen Ressourcen autonom ausführen.
2. **extern** — Deploy, Domain, Indexierung oder andere sichtbare Änderungen.
   Darf BYB nur innerhalb einer erteilten Einzel- oder Dauerfreigabe ausführen.
3. **finanziell** — Ads schalten, Budget erhöhen, kostenpflichtige Ressourcen
   buchen. Braucht eine explizite Budget-/Freigaberegel; BYB überschreitet sie
   nicht.

Eine Dauerfreigabe soll echte Autonomie ermöglichen: Der Nutzer kann z. B.
erlauben, dass BYB Deployments oder Ads innerhalb eines festgelegten Rahmens
selbstständig ausführt. Diese Grenze bleibt sichtbar und widerrufbar.

## Transparenz

Der zentrale Vertrauensmechanismus ist ein verständliches Activity Log. Beispiele:

- „Repo verbunden und Branch für den Auftrag erstellt."
- „Datenbankschema erstellt und Migration im Testzweig geprüft."
- „Checkout-Test fehlgeschlagen; Ursache gefunden und behoben."
- „Deployment wartet auf deine Freigabe."
- „Kampagne liegt innerhalb deines Tagesbudgets und wurde veröffentlicht."

Jede relevante Aktion hat Zustand, Ergebnis, Credit-Verbrauch und — wenn nötig —
eine Freigabe. Keine versteckten Nebenwirkungen.

## Prüfprotokoll

Das Prüfprotokoll ist ein wichtiger Teil von BYB, aber **nicht das gesamte
Produkt**. Es dokumentiert Debug-/Security-Prüfungen mit Beweisen:

- geprüft auf X
- gefunden Y
- behoben Z
- offen N

Jeder Fund wird für Nicht-Techniker verständlich erklärt. Offene Punkte werden
gezeigt. Niemals „sicher" oder „garantiert" behaupten.

## Credits

BYB verwendet ein Abo-plus-Credits-Modell. Credits normalisieren unterschiedliche
Kosten wie Modellnutzung, autonome Agentenläufe, Build-/Sandbox-Zeit und später
Mediengenerierung. Vor größeren Aufträgen zeigt BYB eine Schätzung; tatsächlich
verbrauchte Credits werden pro Aktion dokumentiert.

## Produktphasen

Die große Vision reicht bis Betrieb, Monitoring und Growth. Die Umsetzung wird
aber in überprüfbaren Scheiben gebaut:

1. Repo → Backend → Tests → Deploy
2. echte Sandbox-/Debug-/Security-Läufe und Auto-Fix
3. Stripe + Credits
4. Domain + Google-Indexierung
5. Higgsfield + Meta/TikTok Ads
6. permanentes Monitoring und autonome Optimierung

Keine spätere Phase wird in der Oberfläche als verfügbar dargestellt, bevor der
zugrunde liegende Connector und seine Freigabegrenzen nachgewiesen sind.

## Sprache im Interface

Deutsch, Du-Form, aktiv statt passiv. Ein Begriff behält durch den Ablauf seine
Bedeutung. Fehler erklären, **was passiert ist, was BYB bereits versucht hat und
was jetzt blockiert**; sie entschuldigen sich nicht und verstecken nichts.
