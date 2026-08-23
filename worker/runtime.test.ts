import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AktionsLease } from "../control-plane/speicher.js";

const mocks = vi.hoisted(() => ({
  leasen: vi.fn(),
  erneuern: vi.fn(),
  abschliessen: vi.fn(),
  fehler: vi.fn(),
}));

vi.mock("../control-plane/speicher.js", () => ({
  naechsteAktionLeasen: mocks.leasen,
  leaseErneuern: mocks.erneuern,
  aktionMitLeaseAbschliessen: mocks.abschliessen,
}));

vi.mock("../control-plane/fehler-speicher.js", () => ({
  aktionMitLeaseFehlerSpeichern: mocks.fehler,
}));

import { workerEinmalAusfuehren } from "./runtime.js";

const db = {
  query() {
    return Promise.resolve({ rows: [] });
  },
};

function lease(versuch = 1): AktionsLease {
  return {
    auftragId: "auftrag-1",
    projektId: "projekt-1",
    aktionId: "repo-vorbereiten",
    nutzerId: "nutzer-1",
    leaseToken: "11111111-1111-4111-8111-111111111111",
    leaseBisMs: 10_000,
    versuch,
    aktion: {
      id: "repo-vorbereiten",
      typ: "repo",
      titel: "Arbeitsbranch vorbereiten",
      beschreibung: "BYB bereitet einen isolierten Arbeitsbranch vor.",
      zustand: "laeuft",
      abhaengigkeiten: [],
      verbindung_ids: ["github-1"],
      freigabe: { klasse: "intern", status: "nicht_erforderlich" },
      credits_geschaetzt: 2,
      credits_verbraucht: 0,
    },
  };
}

describe("Worker-Runtime", () => {
  beforeEach(() => {
    mocks.leasen.mockReset();
    mocks.erneuern.mockReset();
    mocks.abschliessen.mockReset();
    mocks.fehler.mockReset();
  });

  it("beendet einen leeren Poll ohne Executor-Aufruf und filtert auf registrierte Typen", async () => {
    mocks.leasen.mockResolvedValue(undefined);
    const executor = { ausfuehren: vi.fn() };

    await expect(
      workerEinmalAusfuehren(db, { repo: executor }, { workerId: "worker-1", zeitstempel: 1000 }),
    ).resolves.toEqual({ status: "leer" });
    expect(mocks.leasen).toHaveBeenCalledWith(db, "worker-1", 60_000, 1000, ["repo"]);
    expect(executor.ausfuehren).not.toHaveBeenCalled();
    expect(mocks.erneuern).not.toHaveBeenCalled();
  });

  it("erneuert die Lease, führt den passenden Executor aus und persistiert das Ergebnis", async () => {
    const geliehen = lease();
    mocks.leasen.mockResolvedValue(geliehen);
    mocks.erneuern.mockResolvedValue(70_000);
    mocks.abschliessen.mockResolvedValue({});
    const executor = {
      ausfuehren: vi.fn().mockResolvedValue({
        klartext: "Isolierter GitHub-Arbeitsbranch angelegt.",
        creditsVerbraucht: 1,
      }),
    };

    const ergebnis = await workerEinmalAusfuehren(
      db,
      { repo: executor },
      { workerId: "worker-1", leaseDauerMs: 60_000, zeitstempel: 1000 },
    );

    expect(mocks.leasen).toHaveBeenCalledWith(db, "worker-1", 60_000, 1000, ["repo"]);
    expect(mocks.erneuern).toHaveBeenCalledWith(
      db,
      "auftrag-1",
      "repo-vorbereiten",
      geliehen.leaseToken,
      60_000,
    );
    expect(executor.ausfuehren).toHaveBeenCalledWith(geliehen);
    expect(mocks.abschliessen).toHaveBeenCalledWith(
      db,
      "auftrag-1",
      "repo-vorbereiten",
      geliehen.leaseToken,
      "Isolierter GitHub-Arbeitsbranch angelegt.",
      1,
      1001,
    );
    expect(mocks.fehler).not.toHaveBeenCalled();
    expect(ergebnis.status).toBe("abgeschlossen");
  });

  it("persistiert einen frühen Executor-Fehler als begrenzte Wiederholung", async () => {
    const geliehen = lease(1);
    mocks.leasen.mockResolvedValue(geliehen);
    mocks.erneuern.mockResolvedValue(70_000);
    mocks.fehler.mockResolvedValue({ wiederholen: true, versuch: 1, auftrag: {} });
    const executor = {
      ausfuehren: vi.fn().mockRejectedValue(new Error("Bearer sehr-geheim Provider nicht erreichbar")),
    };

    const ergebnis = await workerEinmalAusfuehren(
      db,
      { repo: executor },
      { workerId: "worker-1", maxVersuche: 3, zeitstempel: 1000 },
    );

    expect(mocks.abschliessen).not.toHaveBeenCalled();
    expect(mocks.fehler).toHaveBeenCalledWith(
      db,
      geliehen.auftragId,
      geliehen.aktionId,
      geliehen.leaseToken,
      "Bearer [entfernt] Provider nicht erreichbar",
      3,
      1001,
    );
    expect(ergebnis).toMatchObject({ status: "wiederholen", versuch: 1 });
  });

  it("liefert nach ausgeschöpften Versuchen einen terminalen Fehlerzustand zurück", async () => {
    const geliehen = lease(3);
    mocks.leasen.mockResolvedValue(geliehen);
    mocks.erneuern.mockResolvedValue(70_000);
    mocks.fehler.mockResolvedValue({ wiederholen: false, versuch: 3, auftrag: {} });
    const executor = { ausfuehren: vi.fn().mockRejectedValue("Provider bleibt nicht erreichbar") };

    const ergebnis = await workerEinmalAusfuehren(
      db,
      { repo: executor },
      { workerId: "worker-1", maxVersuche: 3, zeitstempel: 1000 },
    );

    expect(mocks.fehler).toHaveBeenCalledWith(
      db,
      geliehen.auftragId,
      geliehen.aktionId,
      geliehen.leaseToken,
      "Provider bleibt nicht erreichbar",
      3,
      1001,
    );
    expect(ergebnis).toMatchObject({ status: "fehlgeschlagen", versuch: 3 });
  });

  it("reicht bei leerem Register eine leere Typmenge an die Queue weiter", async () => {
    mocks.leasen.mockResolvedValue(undefined);

    await expect(
      workerEinmalAusfuehren(db, {}, { workerId: "worker-1", zeitstempel: 1000 }),
    ).resolves.toEqual({ status: "leer" });
    expect(mocks.leasen).toHaveBeenCalledWith(db, "worker-1", 60_000, 1000, []);
    expect(mocks.erneuern).not.toHaveBeenCalled();
    expect(mocks.abschliessen).not.toHaveBeenCalled();
    expect(mocks.fehler).not.toHaveBeenCalled();
  });
});
