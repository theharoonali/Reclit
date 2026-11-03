import { describe, expect, test } from "bun:test";
import {
  companyInitial,
  isSameWebsite,
  normalizeWebsite,
  websiteHost,
} from "@/lib/company/website";

describe("normalizeWebsite", () => {
  test("adds https and drops trailing slashes", () => {
    expect(normalizeWebsite(" example.com/ ")).toBe("https://example.com");
    expect(normalizeWebsite("http://example.com/about")).toBe(
      "http://example.com/about",
    );
    expect(normalizeWebsite("   ")).toBe("");
  });
});

describe("isSameWebsite", () => {
  test("ignores the scheme it adds, case and the trailing slash", () => {
    expect(isSameWebsite("Example.com/", "https://example.com")).toBe(true);
  });

  test("is false for another address or nothing saved", () => {
    expect(isSameWebsite("acme.com", "https://example.com")).toBe(false);
    expect(isSameWebsite("example.com", null)).toBe(false);
  });
});

describe("websiteHost", () => {
  test("shows the host without www", () => {
    expect(websiteHost("https://www.acme.com/about")).toBe("acme.com");
    expect(websiteHost("acme.io")).toBe("acme.io");
  });

  test("returns the input when it cannot be parsed", () => {
    expect(websiteHost("http://")).toBe("http://");
  });
});

describe("companyInitial", () => {
  test("takes the name's initial, else the host's", () => {
    expect(companyInitial("reclit", "https://x.com")).toBe("R");
    expect(companyInitial(null, "https://www.acme.com")).toBe("A");
    expect(companyInitial("  ", null)).toBe("");
  });
});
