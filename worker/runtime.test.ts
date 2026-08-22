import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AktionsLease } from "../control-plane/speicher.js";

const mocks = vi.hoisted(() => ({
  leasen: vi.fn(),
  erneuern: vi.fn(),
  abschliessen: vi.fn(),
}));

vi.mock("../control-plane/speicher.js", () => ({
  naechsteAktionLeasen: mocks.leasen,
  leaseErneuern: mocks.erneuern,
  aktionMitLeaseAbschliessen: mocks.abschliessen,
}));

import { workerEinmalAusfuehren } from "./runtime.js";

const db = {
  query() {
    return Promise.resolve({ rows: [] });
  },
};

function lease(): AktionsLease {
  return {
    auftragId: "auftrag-1",
    aktionId: "repo-vorbereiten",
    nutzerId: "nutzer-1",
    leaseToken: "11111111-1111-4111-8111-111111111111",
    leaseBisMs: 10_000,
    versuch: 1,
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
  });

  it("beendet einen leeren Poll ohne Executor-Aufruf", async () => {
    mocks.leasen.mockResolvedValue(undefined);
    const executor = { ausfuehren: vi.fn() };

    await expect(
      workerEinmalAusfuehren(db, { repo: executor }, { workerId: "worker-1", zeitstempel: 1000 }),
    ).resolves.toEqual({ status: "leer" });
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
    expect(ergebnis.status).toBe("abgeschlossen");
  });

  it("führt eine Aktion ohne registrierten Executor nicht aus", async () => {
    mocks.leasen.mockResolvedValue(lease());

    await expect(
      workerEinmalAusfuehren(db, {}, { workerId: "worker-1", zeitstempel: 1000 }),
    ).resolves.toEqual({
      status: "kein_executor",
      auftragId: "auftrag-1",
      aktionId: "repo-vorbereiten",
      typ: "repo",
    });
    expect(mocks.erneuern).not.toHaveBeenCalled();
    expect(mocks.abschliessen).not.toHaveBeenCalled();
  });
});
