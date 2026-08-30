import { describe, expect, it } from "vitest";

import { BYB_SKILLS, planungsSkillHinweise } from "./katalog.js";

const VERTRAUENSWUERDIGE_EXTERNE_REPOS = new Set([
  "openai/skills",
  "anthropics/skills",
]);

describe("BYB Skill-Katalog", () => {
  it("vergibt eindeutige Skill-IDs", () => {
    const ids = BYB_SKILLS.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("zieht externe Skills nur aus den auditierten Hersteller-Repositories", () => {
    for (const skill of BYB_SKILLS) {
      if (skill.quelle === "byb") continue;
      expect(VERTRAUENSWUERDIGE_EXTERNE_REPOS.has(skill.repository)).toBe(true);
      expect(skill.status).toBe("auditiert");
    }
  });

  it("hält SEO als eigene BYB-Leitplanke statt einen ungeprüften Community-Skill zu installieren", () => {
    const seo = BYB_SKILLS.find((skill) => skill.id === "seo-readiness");
    expect(seo?.quelle).toBe("byb");
    expect(seo?.status).toBe("byb_intern");
  });

  it("liefert kurze Planungsleitplanken ohne externen Laufzeit-Fetch", () => {
    const hinweise = planungsSkillHinweise();
    expect(hinweise.length).toBe(BYB_SKILLS.length);
    expect(hinweise.every((hinweis) => hinweis.length > 20)).toBe(true);
  });
});
