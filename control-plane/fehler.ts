import { z } from "zod";

import { Auftrag, type Auftrag as AuftragTyp } from "./v1.js";

const Text = z.string().trim().min(3).max(300);
const Versuch = z.number().int().min(1).max(100);

function laufendeAktion(auftrag: AuftragTyp, aktionId: string) {
  const aktion = auftrag.aktionen.find((eintrag) => eintrag.id === aktionId);
  if (aktion === undefined) throw new Error(`Unbekannte Aktion: ${aktionId}`);
  if (aktion.zustand !== "laeuft") {
    throw new Error("Nur eine laufende Aktion kann als Fehlversuch verarbeitet werden.");
  }
  return aktion;
}

function ereignisId(auftrag: AuftragTyp, zeitstempel: number): string {
  return `${auftrag.id}-${auftrag.ereignisse.length + 1}-${zeitstempel}`;
}

export function aktionZurWiederholungPlanen(
  auftrag: AuftragTyp,
  aktionId: string,
  grundRoh: string,
  versuchRoh: number,
  maxVersucheRoh: number,
  zeitstempel: number,
): AuftragTyp {
  const aktion = laufendeAktion(auftrag, aktionId);
  const grund = Text.parse(grundRoh);
  const versuch = Versuch.parse(versuchRoh);
  const maxVersuche = Versuch.parse(maxVersucheRoh);
  if (versuch >= maxVersuche) {
    throw new Error("Ein ausgeschöpfter Fehlversuch darf nicht erneut geplant werden.");
  }

  const aktionen = auftrag.aktionen.map((eintrag) =>
    eintrag.id === aktionId
      ? { ...eintrag, zustand: "geplant" as const, ergebnis: undefined }
      : eintrag,
  );

  return Auftrag.parse({
    ...auftrag,
    zustand: "laeuft",
    aktionen,
    ereignisse: [
      ...auftrag.ereignisse,
      {
        id: ereignisId(auftrag, zeitstempel),
        typ: "plan_geaendert",
        zeitstempel,
        klartext: `„${aktion.titel}“ Fehlversuch ${versuch}/${maxVersuche}: ${grund} BYB plant eine begrenzte Wiederholung.`,
        aktion_id: aktionId,
      },
    ],
  });
}

export function aktionEndgueltigFehlschlagen(
  auftrag: AuftragTyp,
  aktionId: string,
  grundRoh: string,
  versuchRoh: number,
  maxVersucheRoh: number,
  zeitstempel: number,
): AuftragTyp {
  const aktion = laufendeAktion(auftrag, aktionId);
  const grund = Text.parse(grundRoh);
  const versuch = Versuch.parse(versuchRoh);
  const maxVersuche = Versuch.parse(maxVersucheRoh);
  if (versuch < maxVersuche) {
    throw new Error("Eine Aktion darf erst nach ausgeschöpften Versuchen terminal fehlschlagen.");
  }

  const aktionen = auftrag.aktionen.map((eintrag) =>
    eintrag.id === aktionId
      ? {
          ...eintrag,
          zustand: "fehlgeschlagen" as const,
          ergebnis: grund,
        }
      : eintrag,
  );

  return Auftrag.parse({
    ...auftrag,
    zustand: "fehlgeschlagen",
    aktionen,
    ereignisse: [
      ...auftrag.ereignisse,
      {
        id: ereignisId(auftrag, zeitstempel),
        typ: "aktion_fehlgeschlagen",
        zeitstempel,
        klartext: `„${aktion.titel}“ nach ${versuch}/${maxVersuche} Versuchen fehlgeschlagen: ${grund}`,
        aktion_id: aktionId,
      },
    ],
  });
}
