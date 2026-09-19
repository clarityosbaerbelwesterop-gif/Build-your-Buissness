import { z } from "zod";

export const SURFACE_PROJEKT_ID = "surface-v1" as const;
export const SURFACE_VERSION = 1 as const;

export const SURFACE_AKTION = {
  landing: "surface-landing",
  lead: "surface-lead",
  agent: "surface-agent",
} as const;

export const SurfaceSchrittArt = z.enum(["landing", "lead", "agent"]);
export type SurfaceSchrittArt = z.infer<typeof SurfaceSchrittArt>;

export const SurfaceSchrittZustand = z.enum([
  "geplant",
  "laeuft",
  "bereit",
  "nicht_verbunden",
  "fehlgeschlagen",
]);
export type SurfaceSchrittZustand = z.infer<typeof SurfaceSchrittZustand>;

export const LandingKopie = z
  .object({
    titel: z.string().trim().min(1).max(80),
    untertitel: z.string().trim().min(1).max(220),
    cta: z.string().trim().min(1).max(40),
    absatz: z.string().trim().min(1).max(400),
  })
  .strict();
export type LandingKopie = z.infer<typeof LandingKopie>;

export const SurfaceLanding = z
  .object({
    zustand: SurfaceSchrittZustand,
    hinweis: z.string().min(3).max(400),
    kopie: LandingKopie.optional(),
    html: z.string().min(1).max(20_000).optional(),
  })
  .strict();
export type SurfaceLanding = z.infer<typeof SurfaceLanding>;

export const SurfaceLead = z
  .object({
    zustand: SurfaceSchrittZustand,
    hinweis: z.string().min(3).max(400),
    aktiv: z.boolean(),
    anzahl: z.number().int().min(0),
  })
  .strict();
export type SurfaceLead = z.infer<typeof SurfaceLead>;

export const SurfaceAgent = z
  .object({
    zustand: SurfaceSchrittZustand,
    hinweis: z.string().min(3).max(400),
    referenz: z.string().min(1).max(180).optional(),
  })
  .strict();
export type SurfaceAgent = z.infer<typeof SurfaceAgent>;

export const SurfaceSchritt = z
  .object({
    art: SurfaceSchrittArt,
    titel: z.string().min(3).max(160),
    zustand: SurfaceSchrittZustand,
    hinweis: z.string().min(3).max(400),
  })
  .strict();
export type SurfaceSchritt = z.infer<typeof SurfaceSchritt>;

export const SurfaceLauf = z
  .object({
    version: z.literal(SURFACE_VERSION),
    auftrag_id: z.string().min(1).max(120),
    idee: z.string().min(10).max(4_000),
    zustand: z.enum(["laeuft", "bereit", "teilweise", "fehlgeschlagen"]),
    landing: SurfaceLanding,
    lead: SurfaceLead,
    agent: SurfaceAgent,
    schritte: z.array(SurfaceSchritt).length(3),
    credits_geschaetzt: z.number().int().min(0),
    credits_verbraucht: z.number().int().min(0),
  })
  .strict();
export type SurfaceLauf = z.infer<typeof SurfaceLauf>;

export const SurfaceAktionsErgebnis = z.discriminatedUnion("art", [
  z
    .object({
      v: z.literal(SURFACE_VERSION),
      art: z.literal("landing"),
      kopie: LandingKopie,
      studio: z.enum(["verbunden", "nicht_verbunden", "unerreichbar"]),
    })
    .strict(),
  z
    .object({
      v: z.literal(SURFACE_VERSION),
      art: z.literal("lead"),
      aktiv: z.boolean(),
    })
    .strict(),
  z
    .object({
      v: z.literal(SURFACE_VERSION),
      art: z.literal("agent"),
      zustand: z.enum(["laeuft", "nicht_verbunden", "unerreichbar"]),
      referenz: z.string().min(1).max(180).optional(),
    })
    .strict(),
]);
export type SurfaceAktionsErgebnis = z.infer<typeof SurfaceAktionsErgebnis>;

export function surfaceErgebnisLesen(roh: string): SurfaceAktionsErgebnis | undefined {
  try {
    const gelesen = SurfaceAktionsErgebnis.safeParse(JSON.parse(roh) as unknown);
    return gelesen.success ? gelesen.data : undefined;
  } catch {
    return undefined;
  }
}

export function surfaceErgebnisSchreiben(ergebnis: SurfaceAktionsErgebnis): string {
  const text = JSON.stringify(SurfaceAktionsErgebnis.parse(ergebnis));
  if (text.length > 2_000) {
    throw new Error("Surface-Aktionsergebnis überschreitet die Control-Plane-Grenze.");
  }
  return text;
}
