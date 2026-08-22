import { z } from "zod";

export const planKeySchema = z.enum(["starter", "pro", "scale"]);
export type PlanKey = z.infer<typeof planKeySchema>;

export interface BybPlan {
  readonly key: PlanKey;
  readonly name: string;
  readonly euroCentProMonat: number;
  readonly monatlicheCredits: number;
  readonly stripeLookupKey: string;
}

export const BYB_PLAENE: readonly BybPlan[] = [
  {
    key: "starter",
    name: "BYB Starter",
    euroCentProMonat: 2_000,
    monatlicheCredits: 100,
    stripeLookupKey: "byb_preview_starter_monthly_eur_v1",
  },
  {
    key: "pro",
    name: "BYB Pro",
    euroCentProMonat: 20_000,
    monatlicheCredits: 750,
    stripeLookupKey: "byb_preview_pro_monthly_eur_v1",
  },
  {
    key: "scale",
    name: "BYB Scale",
    euroCentProMonat: 25_000,
    monatlicheCredits: 1_500,
    stripeLookupKey: "byb_preview_scale_monthly_eur_v1",
  },
] as const;

export const BYB_TOPUP = {
  credits: 100,
  euroCent: 2_500,
  stripeLookupKey: "byb_preview_topup_100_eur_v1",
} as const;

export function planNachKey(key: string): BybPlan | undefined {
  return BYB_PLAENE.find((plan) => plan.key === key);
}
