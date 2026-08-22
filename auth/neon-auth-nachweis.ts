import { pflicht } from "../config/umgebung.js";
import { neonJwtKonfigurationAusUmgebung, neonJwtPruefer } from "./neon-jwt.js";

const token = pflicht("NEON_AUTH_TEST_TOKEN", "echtes Neon-Auth-JWT nachweisen");
const pruefer = neonJwtPruefer(neonJwtKonfigurationAusUmgebung());

try {
  await pruefer(token);
  console.error(
    "Geprüft: Neon Auth hat ein JWT ausgestellt, dessen Signatur, Issuer, Audience, "
    + "Ablaufzeit und Nutzerkennung der M0.7-Prüfer akzeptiert.",
  );
} catch {
  throw new Error("Neon-Auth-Livenachweis: Provider-JWT wurde vom M0.7-Prüfer abgelehnt.");
}
