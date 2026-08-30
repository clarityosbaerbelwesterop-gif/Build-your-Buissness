import { z } from "zod";

export const SkillQuelle = z.enum(["openai", "anthropic", "byb"]);
export type SkillQuelle = z.infer<typeof SkillQuelle>;

export const SkillPhase = z.enum([
  "planen",
  "code",
  "design",
  "connector",
  "test",
  "fix",
  "seo",
  "werbemittel",
]);
export type SkillPhase = z.infer<typeof SkillPhase>;

export interface BybSkillDefinition {
  readonly id: string;
  readonly quelle: SkillQuelle;
  readonly repository: string;
  readonly upstreamPfad: string;
  readonly phasen: readonly SkillPhase[];
  readonly planerHinweis?: string;
  readonly status: "auditiert" | "byb_intern";
}

/**
 * Keine fremden Skill-Dateien werden zur Laufzeit aus GitHub geladen.
 * Der Katalog pinnt nur vertrauenswürdige Herstellerquellen und überführt die
 * für BYB relevanten Prinzipien in kurze eigene Leitplanken. Damit kann ein
 * kompromittierter oder später veränderter Upstream keine Prompts einschleusen.
 */
export const BYB_SKILLS = [
  {
    id: "ziel-schaerfen",
    quelle: "openai",
    repository: "openai/skills",
    upstreamPfad: "skills/.curated/define-goal",
    phasen: ["planen"],
    planerHinweis: "Formuliere vor der Umsetzung ein klares Ergebnis, messbare Abnahmekriterien und erkennbare Blocker.",
    status: "auditiert",
  },
  {
    id: "ci-ursache-beheben",
    quelle: "openai",
    repository: "openai/skills",
    upstreamPfad: "skills/.curated/gh-fix-ci",
    phasen: ["test", "fix"],
    planerHinweis: "Plane bei fehlgeschlagenen Prüfungen Ursachenanalyse und kleinsten belegbaren Fix statt Checks zu umgehen.",
    status: "auditiert",
  },
  {
    id: "frontend-produktqualitaet",
    quelle: "anthropic",
    repository: "anthropics/skills",
    upstreamPfad: "skills/frontend-design",
    phasen: ["design", "code"],
    planerHinweis: "Plane Produktoberflächen als klare, responsive und zugängliche Nutzerflüsse statt als generische Demo-Dashboards.",
    status: "auditiert",
  },
  {
    id: "mcp-connector-design",
    quelle: "anthropic",
    repository: "anthropics/skills",
    upstreamPfad: "skills/mcp-builder",
    phasen: ["connector"],
    planerHinweis: "Connectoren brauchen minimale Berechtigungen, eindeutige Ressourcenwahl, verständliche Tools und sichtbare Fehlergrenzen.",
    status: "auditiert",
  },
  {
    id: "markenkonsistenz",
    quelle: "anthropic",
    repository: "anthropics/skills",
    upstreamPfad: "skills/brand-guidelines",
    phasen: ["design", "werbemittel"],
    planerHinweis: "Halte Produkt- und Werbemittelgestaltung über Seiten und Assets hinweg konsistent mit der vorgegebenen Marke.",
    status: "auditiert",
  },
  {
    id: "web-produkt-bauen",
    quelle: "anthropic",
    repository: "anthropics/skills",
    upstreamPfad: "skills/web-artifacts-builder",
    phasen: ["code", "design"],
    planerHinweis: "Plane Web-Produkte als vollständigen Nutzerfluss mit Zuständen, Fehlerfällen und echter Interaktion statt nur statischer Oberfläche.",
    status: "auditiert",
  },
  {
    id: "seo-readiness",
    quelle: "byb",
    repository: "clarityosbaerbelwesterop-gif/Build-your-Buissness",
    upstreamPfad: "agent-skills/katalog.ts#seo-readiness",
    phasen: ["seo"],
    planerHinweis: "Vor Indexierung müssen Seitentitel, Beschreibungen, Canonical, robots, Sitemap und Search-Console-Ziel zum realen Deployment passen.",
    status: "byb_intern",
  },
] as const satisfies readonly BybSkillDefinition[];

export function planungsSkillHinweise(): string[] {
  return BYB_SKILLS
    .map((skill) => skill.planerHinweis)
    .filter((hinweis): hinweis is string => typeof hinweis === "string");
}
