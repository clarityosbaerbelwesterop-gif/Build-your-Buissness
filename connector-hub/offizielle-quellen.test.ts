import { describe, expect, it } from "vitest";

import { ConnectorAnbieter } from "./v1.js";
import { OFFIZIELLE_CONNECTOR_QUELLEN, offizielleQuelleFuer } from "./offizielle-quellen.js";

const OFFIZIELLE_OWNER = new Set([
  "github",
  "neondatabase",
  "supabase",
  "vercel",
  "stripe",
  "higgsfield-ai",
  "facebook",
  "tiktok",
  "googleapis",
  "googleads",
  "wix",
]);

const COMMUNITY_HIGGSFIELD = [
  "geopopos/higgsfield_ai_mcp",
  "Hikhakk/higgsfield-mcp-unified",
  "jfikrat/higgsfield-mcp",
  "PromptEngineer48/Higgsfield-MCP",
];

describe("offizielle Connector-Quellen", () => {
  it("deckt jeden Connector-Anbieter genau einmal ab", () => {
    const anbieter = OFFIZIELLE_CONNECTOR_QUELLEN.map((quelle) => quelle.anbieter);
    expect(new Set(anbieter).size).toBe(ConnectorAnbieter.options.length);
    expect([...new Set(anbieter)].sort()).toEqual([...ConnectorAnbieter.options].sort());

    for (const eintrag of ConnectorAnbieter.options) {
      expect(offizielleQuelleFuer(eintrag).anbieter).toBe(eintrag);
    }
  });

  it("akzeptiert nur Hersteller-Organisationen als Upstream", () => {
    for (const quelle of OFFIZIELLE_CONNECTOR_QUELLEN) {
      const owner = quelle.repository.split("/")[0];
      expect(OFFIZIELLE_OWNER.has(owner ?? "")).toBe(true);
    }
  });

  it("zieht keine gefundenen Community-Higgsfield-MCPs in die Lieferkette", () => {
    const repositories = new Set(OFFIZIELLE_CONNECTOR_QUELLEN.map((quelle) => quelle.repository));
    for (const communityRepo of COMMUNITY_HIGGSFIELD) {
      expect(repositories.has(communityRepo)).toBe(false);
    }
    expect(offizielleQuelleFuer("higgsfield").repository).toBe("higgsfield-ai/higgsfield-js");
  });

  it("pinnt bekannte offizielle Remote-MCP-Endpunkte auf HTTPS", () => {
    for (const quelle of OFFIZIELLE_CONNECTOR_QUELLEN) {
      if (quelle.remoteMcp === undefined) continue;
      const url = new URL(quelle.remoteMcp);
      expect(url.protocol).toBe("https:");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
    }
  });
});
