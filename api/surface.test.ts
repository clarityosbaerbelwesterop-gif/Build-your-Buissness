import { describe, expect, it } from "vitest";

import { GET as surfaceGET, POST as surfacePOST } from "./surface.js";
import { POST as surfaceLeadsPOST } from "./surface-leads.js";

describe("Surface-API", () => {
  it("lehnt unautorisierte Lese- und Schreibzugriffe ab", async () => {
    const get = await surfaceGET(new Request("https://build-your-buissness.vercel.app/api/surface"));
    const post = await surfacePOST(new Request("https://build-your-buissness.vercel.app/api/surface", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idee: "Ein Angebot für ruhige Erstseiten." }),
    }));
    const lead = await surfaceLeadsPOST(new Request("https://build-your-buissness.vercel.app/api/surface-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        auftragId: "auftrag-1",
        name: "Anna",
        email: "anna@example.com",
        nachricht: "Bitte um ein Gespräch.",
      }),
    }));

    expect(get.status).toBe(401);
    expect(post.status).toBe(401);
    expect(lead.status).toBe(401);
  });
});
