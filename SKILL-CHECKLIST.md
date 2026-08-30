# SKILL-CHECKLIST.md — BYB Agent Skills

Ziel: Skills verbessern Planung und Ausführung, ohne beliebige GitHub-Prompts zur
Laufzeit in BYB einzuschleusen.

## Vertrauensmodell

- Externe Skill-Quellen werden nur aus ausdrücklich auditierten Hersteller-Repositories übernommen.
- BYB lädt keine fremden `SKILL.md`-Dateien dynamisch während eines Kundenauftrags.
- Der produktive Planer erhält kurze, BYB-eigene Leitplanken, die aus den geprüften Skills abgeleitet sind.
- Community-Skills können später einzeln geprüft werden, sind aber nicht automatisch installierbar.

## Aktueller Katalog

| Skill | Quelle | Zweck | Status |
|---|---|---|---|
| Ziel schärfen | `openai/skills` · `.curated/define-goal` | Ziel, Abnahme, Blocker | auditiert |
| CI-Ursache beheben | `openai/skills` · `.curated/gh-fix-ci` | Fehlerursache statt Gate-Umgehung | auditiert |
| Frontend-Produktqualität | `anthropics/skills` · `frontend-design` | klare responsive Nutzerflüsse | auditiert |
| MCP-Connector-Design | `anthropics/skills` · `mcp-builder` | minimale Rechte, Resource Scope, Tools | auditiert |
| Markenkonsistenz | `anthropics/skills` · `brand-guidelines` | Produkt- und Creative-Konsistenz | auditiert |
| Web-Produkt bauen | `anthropics/skills` · `web-artifacts-builder` | vollständige Interaktion statt Demo-UI | auditiert |
| SEO Readiness | BYB intern | Canonical, robots, Sitemap, Search Console | BYB-intern |

## Warum kein beliebiger SEO-/Game-Studio-Skill?

Die GitHub-Recherche hat in den aktuell geprüften offiziellen OpenAI-Skills keinen
eigenen SEO-Skill ergeben. Statt einen Community-Skill ungeprüft in die
Lieferkette zu nehmen, besitzt BYB dafür zunächst eine kleine eigene SEO-Grenze.
Dasselbe gilt für spezialisierte Game-Studio-Skills: erst Herkunft, Lizenz,
Prompt-Inhalt und Tool-Rechte prüfen; danach kann ein eigener fachlicher Katalog
ergänzt werden.

## Nachweis

`agent-skills/katalog.test.ts` prüft:

- eindeutige Skill-IDs,
- externe Quellen ausschließlich `openai/skills` und `anthropics/skills`,
- SEO bleibt intern statt Community-Code zu übernehmen,
- Planungsleitplanken sind vorhanden.

`control-plane/planer.test.ts` prüft zusätzlich, dass diese Leitplanken wirklich
im Systemprompt des BYB-Planers ankommen.
