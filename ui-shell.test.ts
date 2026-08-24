import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function lesen(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");
}

describe("BYB Produktoberfläche", () => {
  it("zeigt nach Login den Leitstand statt des Checkout-Hubs", () => {
    const login = lesen("login.html");
    const app = lesen("app.html");

    expect(login).toContain("location.replace('/app.html')");
    expect(login).not.toContain("LIVE-TEST");
    expect(login).not.toContain("Checkout öffnen");
    expect(app).toContain("Was soll BYB für dich tun?");
    expect(app).toContain("Connector Hub");
    expect(app).toContain("Noch keine Aktivität.");
  });

  it("stellt Demo-Auftrag auf der Landingpage nicht als reale Aktivität dar", () => {
    const landing = lesen("index.html");

    expect(landing).not.toContain("AUFTRAG 8D2F");
    expect(landing).not.toContain("Aktion a7f3");
    expect(landing).not.toContain("LIVE-TEST");
  });

  it("hält Top-up aus dem Leitstand heraus und zeigt ihn in Abrechnung nur bei Bedarf", () => {
    const app = lesen("app.html");
    const billing = lesen("billing.html");

    expect(app).not.toContain("100 Credits aufladen");
    expect(billing).toContain('class="topup" id="topup"');
    expect(billing).toContain("saldo<=0");
  });

  it("verlinkt die rechtlichen Seiten auf den zentralen Oberflächen", () => {
    for (const datei of ["index.html", "login.html", "app.html", "billing.html"]) {
      const inhalt = lesen(datei);
      expect(inhalt).toContain('/impressum.html');
      expect(inhalt).toContain('/datenschutz.html');
      expect(inhalt).toContain('/agb.html');
      expect(inhalt).toContain('/eula.html');
    }
  });
});
