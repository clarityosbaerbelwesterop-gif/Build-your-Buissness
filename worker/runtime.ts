import type { SqlVerbindung } from "../db/auth-kontext.js";
import {
  aktionMitLeaseAbschliessen,
  leaseErneuern,
  naechsteAktionLeasen,
  type AktionsLease,
} from "../control-plane/speicher.js";
import { aktionMitLeaseFehlerSpeichern } from "../control-plane/fehler-speicher.js";
import type { Aktionstyp } from "../control-plane/v1.js";
import { entschaerfen } from "../db/entschaerfen.js";

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
      readonly status: "wiederholen";
      readonly auftragId: string;
      readonly aktionId: string;
      readonly versuch: number;
      readonly fehler: string;
    }
  | {
      readonly status: "fehlgeschlagen";
      readonly auftragId: string;
      readonly aktionId: string;
      readonly versuch: number;
      readonly fehler: string;
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
  readonly maxVersuche?: number;
  readonly zeitstempel?: number;
}

function executorFehlertext(fehler: unknown): string {
  const roh = fehler instanceof Error
    ? fehler.message
    : typeof fehler === "string"
      ? fehler
      : "Unbekannter Executor-Fehler.";
  const bereinigt = entschaerfen(roh).trim();
  return bereinigt.length >= 3 ? bereinigt : "Executor-Fehler ohne verwertbaren Detailtext.";
}

export async function workerEinmalAusfuehren(
  db: SqlVerbindung,
  register: ExecutorRegister,
  optionen: WorkerOptionen,
): Promise<WorkerSchrittErgebnis> {
  const zeitstempel = optionen.zeitstempel ?? Date.now();
  const leaseDauerMs = optionen.leaseDauerMs ?? 60_000;
  const maxVersuche = optionen.maxVersuche ?? 3;
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

  try {
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
  } catch (fehler) {
    const fehlerText = executorFehlertext(fehler);
    const gespeichert = await aktionMitLeaseFehlerSpeichern(
      db,
      lease.auftragId,
      lease.aktionId,
      lease.leaseToken,
      fehlerText,
      maxVersuche,
      zeitstempel + 1,
    );

    return {
      status: gespeichert.wiederholen ? "wiederholen" : "fehlgeschlagen",
      auftragId: lease.auftragId,
      aktionId: lease.aktionId,
      versuch: gespeichert.versuch,
      fehler: fehlerText,
    };
  }
}
