import { describe, expect, it } from "vitest";

import { githubBenutzerAutorisierungsUrl } from "./github-oauth.js";

const state = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-";

describe("GitHub User OAuth", () => {
  it("bindet Client, State und exakten HTTPS-Callback", () => {
    const url = new URL(githubBenutzerAutorisierungsUrl(
      { clientId: "Iv1.byb-test" },
      state,
      "https://build-your-buissness.vercel.app/github-connect.html",
    ));
    expect(url.origin).toBe("https://github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv1.byb-test");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://build-your-buissness.vercel.app/github-connect.html",
    );
  });

  it("verweigert unverschlüsselte Callback-URLs", () => {
    expect(() => githubBenutzerAutorisierungsUrl(
      { clientId: "Iv1.byb-test" },
      state,
      "http://example.test/github-connect.html",
    )).toThrow(/HTTPS/);
  });
});
