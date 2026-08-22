import type { SqlVerbindung } from "../db/auth-kontext.js";
import {
  aktionMitLeaseAbschliessen,
  leaseErneuern,
  naechsteAktionLeasen,
  type AktionsLease,
} from "../control-plane/speicher.js";
import type { Aktionstyp } from "../control-plane/v1.js";

export interface ExecutorErgebnis {
  readonly klartext: string;
  readonly creditsVerbraucht: number;
}

export interface AktionsExecutor {
  ausfuehren(lease: AktionsLease): Promise<ExecutorErgebnis>;
}

export type ExecutorRegister = Partial<Record<Aktionstyp, AktionsExecutor>>;

export type WorkerSchrittErgebnis =
  | { readonly status: "leer" }
  | {
      readonly status: "abgeschlossen";
      readonly auftragId: string;
      readonly aktionId: string;
      readonly klartext: string;
    }
  | {
      readonly status: "kein_executor";
      readonly auftragId: string;
      readonly aktionId: string;
      readonly typ: Aktionstyp;
    };

export interface WorkerOptionen {
  readonly workerId: string;
  readonly leaseDauerMs?: number;
  readonly zeitstempel?: number;
}

export async function workerEinmalAusfuehren(
  db: SqlVerbindung,
  register: ExecutorRegister,
  optionen: WorkerOptionen,
): Promise<WorkerSchrittErgebnis> {
  const zeitstempel = optionen.zeitstempel ?? Date.now();
  const leaseDauerMs = optionen.leaseDauerMs ?? 60_000;
  const erlaubteTypen = Object.keys(register) as Aktionstyp[];
  const lease = await naechsteAktionLeasen(
    db,
    optionen.workerId,
    leaseDauerMs,
    zeitstempel,
    erlaubteTypen,
  );
  if (lease === undefined) return { status: "leer" };

  const executor = register[lease.aktion.typ];
  if (executor === undefined) {
    return {
      status: "kein_executor",
      auftragId: lease.auftragId,
      aktionId: lease.aktionId,
      typ: lease.aktion.typ,
    };
  }

  await leaseErneuern(
    db,
    lease.auftragId,
    lease.aktionId,
    lease.leaseToken,
    leaseDauerMs,
  );

  const ergebnis = await executor.ausfuehren(lease);
  await aktionMitLeaseAbschliessen(
    db,
    lease.auftragId,
    lease.aktionId,
    lease.leaseToken,
    ergebnis.klartext,
    ergebnis.creditsVerbraucht,
    zeitstempel + 1,
  );

  return {
    status: "abgeschlossen",
    auftragId: lease.auftragId,
    aktionId: lease.aktionId,
    klartext: ergebnis.klartext,
  };
}
