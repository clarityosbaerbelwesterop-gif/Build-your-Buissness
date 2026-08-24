import { describe, expect, it } from "vitest";

import { connectorUebersicht } from "./connectors.js";
import { ConnectorVerbindung } from "../connector-hub/v1.js";

describe("Connector-API-Projektion", () => {
  it("liefert nur produktrelevante Verbindungs- und Ressourcendaten", () => {
    const verbindung = ConnectorVerbindung.parse({
      version: 1,
      id: "github-1",
      anbieter: "github",
      modus: "oauth",
      konto_ref: "konto-123",
      status: "verbunden",
      scopes: ["repo"],
      ressourcen: [
        {
          id: "repo-1",
          art: "repo",
          name: "Build-your-Buissness",
        },
      ],
    });

    const [ergebnis] = connectorUebersicht([verbindung]);

    expect(ergebnis).toEqual({
      id: "github-1",
      anbieter: "github",
      konto_ref: "konto-123",
      status: "verbunden",
      ressourcen: [
        {
          id: "repo-1",
          art: "repo",
          name: "Build-your-Buissness",
        },
      ],
    });
    expect(ergebnis).not.toHaveProperty("scopes");
  });
});
