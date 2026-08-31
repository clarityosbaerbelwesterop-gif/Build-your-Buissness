import { describe, expect, it } from "vitest";

import { CONNECTOR_ADAPTER, adapterFuer } from "./adapter-katalog.js";
import { ConnectorAnbieter } from "./v1.js";

describe("Connector-Adapterkatalog", () => {
  it("definiert jeden BYB-Provider genau einmal", () => {
    expect(CONNECTOR_ADAPTER).toHaveLength(ConnectorAnbieter.options.length);
    expect(new Set(CONNECTOR_ADAPTER.map((adapter) => adapter.anbieter)).size).toBe(
      ConnectorAnbieter.options.length,
    );
    for (const anbieter of ConnectorAnbieter.options) {
      expect(adapterFuer(anbieter).anbieter).toBe(anbieter);
    }
  });

  it("klassifiziert kosten- oder budgetwirksame Provider als finanziell", () => {
    for (const anbieter of ["stripe", "higgsfield", "meta_ads", "tiktok_ads", "google_ads"] as const) {
      expect(adapterFuer(anbieter).schreibklasse).toBe("finanziell");
    }
  });

  it("markiert veröffentlichungswirksame Provider mindestens als extern", () => {
    for (const anbieter of ["vercel", "youtube", "google_search_console", "wix"] as const) {
      expect(adapterFuer(anbieter).schreibklasse).toBe("extern");
    }
  });

  it("weist jeder Definition den offiziellen Upstream zu", () => {
    for (const adapter of CONNECTOR_ADAPTER) {
      expect(adapter.upstreamRepository).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    }
    expect(adapterFuer("higgsfield").upstreamRepository).toBe("higgsfield-ai/higgsfield-js");
    expect(adapterFuer("youtube").upstreamRepository).toBe("googleapis/google-api-nodejs-client");
    expect(adapterFuer("wix").upstreamRepository).toBe("wix/wix-mcp");
  });
});
