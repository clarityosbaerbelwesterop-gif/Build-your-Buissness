import { z } from "zod";

export const planKeySchema = z.enum(["starter", "pro", "scale"]);
export type PlanKey = z.infer<typeof planKeySchema>;

export interface BybPlan {
  readonly key: PlanKey;
  readonly name: string;
  readonly euroCentProMonat: number;
  readonly monatlicheCredits: number;
  readonly stripeLookupKey: string;
  readonly stripePriceId: string;
}

export const BYB_PLAENE: readonly BybPlan[] = [
  {
    key: "starter",
    name: "BYB Starter",
    euroCentProMonat: 2_000,
    monatlicheCredits: 100,
    stripeLookupKey: "byb_preview_starter_monthly_eur_v1",
    stripePriceId: "price_1U7KKTEmDA2oLCpoFMDfVMFX",
  },
  {
    key: "pro",
    name: "BYB Pro",
    euroCentProMonat: 20_000,
    monatlicheCredits: 750,
    stripeLookupKey: "byb_preview_pro_monthly_eur_v1",
    stripePriceId: "price_1U7KKkEmDA2oLCpovYILrh4y",
  },
  {
    key: "scale",
    name: "BYB Scale",
    euroCentProMonat: 25_000,
    monatlicheCredits: 1_500,
    stripeLookupKey: "byb_preview_scale_monthly_eur_v1",
    stripePriceId: "price_1U7KKrEmDA2oLCpoYzaMD8YP",
  },
] as const;

export const BYB_TOPUP = {
  credits: 100,
  euroCent: 2_500,
  stripeLookupKey: "byb_preview_topup_100_eur_v1",
  stripePriceId: "price_1U7KKzEmDA2oLCpohEa9tqIk",
} as const;

export function planNachKey(key: string): BybPlan | undefined {
  return BYB_PLAENE.find((plan) => plan.key === key);
}

export function planNachStripePreis(priceId: string): BybPlan | undefined {
  return BYB_PLAENE.find((plan) => plan.stripePriceId === priceId);
}
