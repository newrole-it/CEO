/** Run: npm test  (node:test via tsx). Covers normalization, dedupe keys and URLs. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalizeUrl, extractAtsKey } from "../dedupe";
import {
  detectSeniority,
  normalizeCompany,
  normalizeLocation,
  normalizeSalary,
  normalizeTitle,
  parseSalaryText,
} from "../normalization";

describe("normalization", () => {
  it("titles", () => {
    assert.equal(normalizeTitle("Senior Eng. Manager (m/f/d) – Remote"), "senior engineering manager");
    assert.equal(normalizeTitle("Chief Technology Officer / CTO – Warszawa"), "cto cto");
    assert.equal(normalizeTitle("Kierownik Działu IT (k/m)"), "kierownik dzialu it");
  });
  it("seniority (EN + PL)", () => {
    const s = (t: string) => detectSeniority(normalizeTitle(t));
    assert.equal(s("CTO"), "c_level");
    assert.equal(s("VP of Engineering"), "vp");
    assert.equal(s("Head of Engineering"), "head");
    assert.equal(s("Kierownik Działu IT"), "head");
    assert.equal(s("Dyrektor IT"), "director");
    assert.equal(s("Senior Engineering Manager"), "senior_manager");
    assert.equal(s("Kierowniczka Zespołu Programistów"), "manager");
    assert.equal(s("Engineering Team Lead"), "lead");
    assert.equal(s("Młodszy Programista"), "junior");
    assert.equal(s("Staż w dziale IT"), "intern");
  });
  it("company", () => {
    assert.equal(normalizeCompany("Brzozowa Labs Polska Sp. z o.o."), "brzozowa labs");
    assert.equal(normalizeCompany("Wisła Logistics S.A."), "wisla logistics");
    assert.equal(normalizeCompany("Ferrum Robotics GmbH"), "ferrum robotics");
  });
  it("locations & work modes", () => {
    const l = normalizeLocation;
    assert.deepEqual(l("WWA").cities, [{ city: "Warszawa", country: "PL" }]);
    assert.deepEqual(l("Warsaw, Poland").cities, [{ city: "Warszawa", country: "PL" }]);
    assert.equal(l("Kraków", "zdalnie").workMode, "remote");
    assert.equal(l("Wrocław, praca hybrydowa").workMode, "hybrid");
    assert.equal(l("Łódź, stacjonarnie").workMode, "onsite");
    assert.equal(l("Gdańsk").workMode, "unknown");
    assert.deepEqual(l("Remote (US only)").remoteRegions, ["US"]);
    assert.deepEqual(l("Remote (CET ±2h)").remoteRegions, ["EU"]);
    assert.equal(l("Poznań (home office)").workMode, "remote");
    assert.equal(l("Warszawa, 2 days in office").workMode, "hybrid");
  });
  it("salary parsing", () => {
    const p = (t: string, d?: "PLN") => parseSalaryText(t, { defaultCurrency: d });
    assert.deepEqual(p("25 000 – 32 000 PLN netto + VAT / mies. (B2B)"), [{ min: 25000, max: 32000, currency: "PLN", period: "month", contract: "b2b", basis: "net_of_vat" }]);
    assert.deepEqual(p("€90k–110k/year")[0], { min: 90000, max: 110000, currency: "EUR", period: "year", contract: "unknown", basis: "unknown" });
    assert.deepEqual(p("150–190 PLN/h + VAT")[0]?.period, "hour");
    assert.deepEqual(p("do 30 000 zł brutto")[0], { min: null, max: 30000, currency: "PLN", period: "month", contract: "uop", basis: "gross", contractInferred: true });
    assert.equal(p("od 20k", "PLN")[0]?.max, null);
    assert.equal(p("1 200 PLN / dzień (B2B)")[0]?.min, 1200);
    const two = p("B2B: 30 000 - 38 000 PLN netto + VAT; UoP: 24 000 - 30 000 PLN brutto");
    assert.equal(two.length, 2);
    assert.equal(normalizeSalary(two)?.monthlyPlnMax, 38000);
  });
  it("salary conversion assumptions", () => {
    const s = normalizeSalary(parseSalaryText("$120,000 per year"))!;
    assert.equal(s.monthlyPlnMax, Math.round((120000 / 12) * 3.95));
    assert.ok(s.assumptions.some((a) => a.includes("USD→PLN")));
    const h = normalizeSalary(parseSalaryText("200 PLN/h B2B"))!;
    assert.equal(h.monthlyPlnMin, 200 * 168);
  });
  it("urls & ATS keys", () => {
    assert.equal(canonicalizeUrl("https://www.linkedin.com/jobs/view/head-of-x-at-y-3998877665/?refId=1&trackingId=2"), "https://linkedin.com/jobs/view/3998877665");
    assert.equal(canonicalizeUrl("https://Boards.Greenhouse.io/acme/jobs/123/?utm_source=x&gh_src=y#apply"), "https://boards.greenhouse.io/acme/jobs/123");
    assert.equal(extractAtsKey("https://acme.example/careers?gh_jid=4567", "company_site"), "greenhouse:4567");
    assert.equal(extractAtsKey("https://apply.workable.com/acme/j/7C2A9B41D0/", "workable"), "workable:acme:7C2A9B41D0");
    assert.equal(extractAtsKey("https://www.pracuj.pl/praca/x,oferta,1003456789", "pracuj"), "pracuj:1003456789");
  });
  it("scopes tenant-local ids by board, once", () => {
    const tutlo = extractAtsKey("https://tutlo.traffit.com/public/an/106", "company_site", "106", "Tutlo");
    const zen = extractAtsKey("https://zen.traffit.com/public/an/106", "company_site", "106", "zen");
    assert.equal(tutlo, "company_site:tutlo:106");
    assert.equal(zen, "company_site:zen:106");
    assert.equal(extractAtsKey("https://tutlo.traffit.com/x", "company_site", "tutlo:106", "tutlo"), "company_site:tutlo:106");
    assert.equal(extractAtsKey("https://boards.greenhouse.io/x", "greenhouse", "77", "acme"), "greenhouse:77");
  });
});
