import { describe, expect, it } from "vitest";

import { kopieAusIdee, htmlText, landingHtml, landingKopieErzeugen } from "./landing.js";

describe("Landing-Kopie", () => {
  it("baut eine Vorschau aus der Idee, ohne fremde Behauptungen", () => {
    const kopie = kopieAusIdee("Coaching für Gründerinnen, die ihre erste Angebotsseite brauchen.");
    expect(kopie.titel.toLowerCase()).toContain("coaching");
    expect(kopie.cta).toBe("Anfrage hinterlassen");
    expect(kopie.titel).not.toMatch(/garantiert|sicher|unhackbar/i);
  });

  it("escaped gefährliche Zeichen in der Vorschau", () => {
    expect(htmlText(`<img src="x" onerror="alert(1)">`)).not.toContain("<img");
    const html = landingHtml(kopieAusIdee('Idee mit <script>alert(1)</script> im Text.'));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("fällt auf die Idee zurück, wenn kein Modell verfügbar ist", async () => {
    const kopie = await landingKopieErzeugen("Baue ein Angebot für lokale Handwerker mit klarer Erstberatung.", {
      umgebung: {},
    });
    expect(kopie.titel.length).toBeGreaterThan(3);
    expect(kopie.absatz.length).toBeGreaterThan(3);
  });

  it("nimmt eine gültige Modell-JSON-Antwort an", async () => {
    const kopie = await landingKopieErzeugen("Ein ruhiges Schreibcoaching für Solo-Gründer.", {
      fragenImpl: () => Promise.resolve({
        text: JSON.stringify({
          titel: "Schreibe das Angebot zu Ende",
          untertitel: "Ein ruhiger Begleiter für Texte, die verkaufen sollen.",
          cta: "Gespräch anfragen",
          absatz: "Du beschreibst das Angebot. Wir machen daraus eine Seite, die Anfragen aufnimmt.",
        }),
        tokensEin: 1,
        tokensAus: 1,
        modell: "test",
      }),
    });
    expect(kopie.titel).toBe("Schreibe das Angebot zu Ende");
    expect(kopie.cta).toBe("Gespräch anfragen");
  });
});
