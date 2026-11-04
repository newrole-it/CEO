/** Run: npm test (node:test via tsx). Countries, subdivisions, cities and remote regions in free-text locations. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeLocation } from "../normalization";
import {
  COUNTRY_CODES,
  COUNTRY_NAMES,
  countryFromText,
  countryName,
  m49Region,
  regionCovers,
  remoteOpenTo,
} from "../places";

const countries = (location: string, hint = "") => [...normalizeLocation(location, hint).countries].sort();
const cities = (location: string) => normalizeLocation(location).cities.map((c) => c.city);

describe("places: country table", () => {
  it("has the 249 ISO 3166-1 codes and no reserved ones", () => {
    assert.equal(COUNTRY_CODES.length, 249);
    for (const code of ["PL", "TW", "AQ"]) assert.ok(COUNTRY_CODES.includes(code), code);
    for (const code of ["EU", "EZ", "UN", "QO", "ZZ", "XA", "XB", "XK", "UK", "AC"]) assert.ok(!COUNTRY_CODES.includes(code), code);
  });
  it("names countries in eight languages", () => {
    assert.ok(COUNTRY_NAMES.DE!.includes("niemcy"));
    assert.ok(COUNTRY_NAMES.DE!.includes("allemagne"));
    assert.equal(countryFromText("Deutschland"), "DE");
    assert.equal(countryFromText("Países Bajos"), "NL");
    assert.equal(countryFromText("Wielka Brytania"), "GB");
    assert.equal(countryFromText("UK"), "GB");
    assert.equal(countryFromText("ng"), "NG");
    assert.equal(countryFromText("Atlantis"), null);
    assert.equal(countryName("DE", "pl"), "Niemcy");
    assert.equal(countryName("EU"), null);
  });
  it("keeps explicit aliases", () => {
    for (const [text, code] of [
      ["Remote, USA", "US"], ["United States of America", "US"], ["Czech Republic", "CZ"], ["Holland", "NL"],
      ["The Netherlands", "NL"], ["South Korea", "KR"], ["UAE", "AE"], ["Turkey", "TR"], ["Ivory Coast", "CI"],
      ["Belfast, Northern Ireland", "GB"], ["Edinburgh, Scotland", "GB"],
    ] as const) assert.deepEqual(countries(text), [code], text);
  });
});

describe("places: unresolved strings from the index", () => {
  const cases: Array<[string, string[], string[]?]> = [
    ["Espoo | HYBRID", ["FI"], ["Espoo"]],
    ["Toronto, Ontario, Canada", ["CA"], ["Toronto"]],
    ["Bangalore, India", ["IN"], ["Bengaluru"]],
    ["Vancouver, BC", ["CA"], ["Vancouver"]],
    ["Mississauga, Ontario, Canada", ["CA"], ["Mississauga"]],
    ["Romania", ["RO"]],
    ["Manila, Manila, Philippines", ["PH"], ["Manila"]],
    ["Lagos, Nigeria", ["NG"], ["Lagos"]],
    ["Pune, India", ["IN"], ["Pune"]],
    ["Calgary, Alberta, Canada", ["CA"], ["Calgary"]],
    ["Ukraine", ["UA"]],
    ["Japan", ["JP"]],
    ["Tokyo, Japan", ["JP"], ["Tokyo"]],
    ["Remote, Nigeria", ["NG"]],
    ["Serbia", ["RS"]],
    ["Brazil", ["BR"]],
    ["Tokyo", ["JP"], ["Tokyo"]],
    ["Chicago", ["US"], ["Chicago"]],
    ["Belarus", ["BY"]],
    ["Belgium", ["BE"]],
    ["Athens", ["GR"], ["Athens"]],
    ["Remote", []],
    ["Remote, South Africa", ["ZA"]],
    ["Remote, Kenya", ["KE"]],
    ["Canada", ["CA"]],
    ["Sydney, New South Wales, Australia", ["AU"], ["Sydney"]],
    ["Salt Lake City, UT", ["US"], ["Salt Lake City"]],
    ["Remote, Singapore", ["SG"]],
    ["Redwood City, CA", ["US"], ["Redwood City"]],
    ["Athens, Greece", ["GR"], ["Athens"]],
    ["Remote, Australia; Remote, Singapore", ["AU", "SG"]],
    ["Brisbane, Queensland, Australia", ["AU"], ["Brisbane"]],
    ["Singapore", ["SG"], ["Singapore"]],
    ["Edmonton, Alberta, Canada", ["CA"], ["Edmonton"]],
    ["Reykjavík", ["IS"], ["Reykjavík"]],
  ];
  for (const [text, want, wantCities] of cases) {
    it(text, () => {
      assert.deepEqual(countries(text), want);
      if (wantCities) assert.deepEqual(cities(text), wantCities);
    });
  }
  it("leaves Valencia alone: GeoNames has a larger Valencia in Venezuela than in Spain", () => {
    assert.deepEqual(countries("Valencia"), []);
  });
});

describe("places: City, ST and codes", () => {
  it("reads a code only after a comma, at the end of a segment", () => {
    assert.deepEqual(countries("Seattle, WA"), ["US"]);
    assert.deepEqual(countries("Austin, TX"), ["US"]);
    assert.deepEqual(countries("Austin, Texas - Hybrid"), ["US"]);
    assert.deepEqual(countries("Mountain View, CA"), ["US"]);
    assert.deepEqual(countries("Zielona Gora, PL"), ["PL"]);
    assert.deepEqual(countries("Alicante, ES, 03010"), ["ES"]);
    assert.deepEqual(countries("Toronto, ON, Canada"), ["CA"]);
    assert.deepEqual(countries("Remote, NL"), ["NL"]);
    assert.deepEqual(countries("CA"), []);
  });
  it("lets the city confirm a country code and a US state override a foreign city", () => {
    assert.deepEqual(countries("Berlin, DE"), ["DE"]);
    assert.deepEqual(countries("Wilmington, DE"), ["US"]);
    assert.deepEqual(countries("Athens, GA"), ["US"]);
    assert.deepEqual(cities("Athens, GA"), []);
    assert.deepEqual(countries("London, ON"), ["CA"]);
    assert.deepEqual(countries("Victoria, BC"), ["CA"]);
    assert.deepEqual(countries("Washington, DC"), ["US"]);
  });
  it("does not guess between two states with the same code", () => {
    assert.deepEqual(countries("Perth, WA"), []);
  });
});

describe("places: false-positive guards", () => {
  it("ignores us, in, or, me, ca, uk as English words", () => {
    assert.deepEqual(countries("Join us in our office"), []);
    assert.deepEqual(countries("Remote - help us grow"), []);
    assert.deepEqual(normalizeLocation("Remote - help us grow").remoteRegions, ["UNKNOWN"]);
    assert.deepEqual(countries("Talk to me or our team"), []);
    assert.deepEqual(countries("ca. 20 km from Warsaw"), ["PL"]);
    assert.deepEqual(countries("Office in Warsaw, in the city centre"), ["PL"]);
    assert.deepEqual(countries("uk based team, wfh friendly culture"), []);
  });
  it("reads US and UK where they stand as a place", () => {
    assert.deepEqual(countries("Remote (US only)"), ["US"]);
    assert.deepEqual(normalizeLocation("Remote (US only)").remoteRegions, ["US"]);
    assert.deepEqual(countries("US - Remote"), ["US"]);
    assert.deepEqual(countries("Remote, US"), ["US"]);
    assert.deepEqual(countries("London, UK"), ["GB"]);
    assert.deepEqual(countries("Remote in EU or UK"), ["GB"]);
  });
  it("tells Georgia the country from Georgia the US state", () => {
    assert.deepEqual(countries("Georgia"), ["GE"]);
    assert.deepEqual(countries("Tbilisi, Georgia"), ["GE"]);
    assert.deepEqual(countries("Atlanta, Georgia"), ["US"]);
    assert.deepEqual(countries("Georgia, USA"), ["US"]);
    assert.deepEqual(countries("Atlanta, GA"), ["US"]);
  });
  it("keeps Niger and Nigeria apart", () => {
    assert.deepEqual(countries("Niger"), ["NE"]);
    assert.deepEqual(countries("Nigeria"), ["NG"]);
    assert.deepEqual(countries("Remote, Niger"), ["NE"]);
  });
  it("takes the longest name and needs ambiguous words to stand alone", () => {
    assert.deepEqual(countries("Jersey City, NJ"), ["US"]);
    assert.deepEqual(countries("St Helier, Jersey"), ["JE"]);
    assert.deepEqual(countries("Newark, New Jersey"), ["US"]);
    assert.deepEqual(countries("Albuquerque, New Mexico"), ["US"]);
    assert.deepEqual(countries("Papua New Guinea"), ["PG"]);
    assert.deepEqual(countries("Guinea-Bissau"), ["GW"]);
    assert.deepEqual(countries("Chad"), ["TD"]);
    assert.deepEqual(countries("Contact Chad Smith"), []);
    assert.deepEqual(countries("Long Island, NY"), ["US"]);
    assert.deepEqual(countries("Granada, Spain"), ["ES"]);
    assert.deepEqual(countries("Lake Zurich, Illinois, United States"), ["US"]);
  });
});

describe("places: remote regions", () => {
  it("follows UN M49", () => {
    assert.equal(m49Region("NG"), "Africa");
    assert.equal(m49Region("AE"), "Asia");
    assert.equal(m49Region("TW"), "Asia");
    assert.equal(m49Region("AQ"), null);
    for (const c of ["PL", "NG", "AE"]) assert.ok(regionCovers("EMEA", c), `EMEA ${c}`);
    assert.ok(!regionCovers("EMEA", "US"));
    for (const c of ["BR", "CA", "US"]) assert.ok(regionCovers("AMERICAS", c), `AMERICAS ${c}`);
    for (const c of ["JP", "AU", "TW", "IN"]) assert.ok(regionCovers("APAC", c), `APAC ${c}`);
    assert.ok(!regionCovers("APAC", "AE"));
    assert.ok(regionCovers("EU", "DE"));
    assert.ok(!regionCovers("EU", "GB"));
    assert.ok(regionCovers("WORLD", "KE"));
    assert.ok(!regionCovers("UNKNOWN", "PL"));
  });
  it("remoteOpenTo", () => {
    const open = (text: string, country: string) => remoteOpenTo(normalizeLocation(text), country);
    assert.ok(open("Remote, worldwide", "NG"));
    assert.ok(open("Remote (EMEA)", "PL"));
    assert.ok(!open("Remote (EMEA)", "US"));
    assert.ok(open("Remote (US only)", "US"));
    assert.ok(!open("Remote (US only)", "PL"));
    assert.ok(open("Remote, Nigeria", "NG"));
    assert.ok(!open("Remote, Nigeria", "PL"));
    assert.ok(open("Remote - Poland", "PL"));
    assert.ok(open("Remote", "PL"));
    assert.ok(open("Remote, Australia; Remote, Singapore", "SG"));
    assert.ok(!open("Remote, Australia; Remote, Singapore", "PL"));
    assert.ok(!open("Warszawa", "PL"));
  });
  it("carries the one country a remote offer names", () => {
    assert.deepEqual(countries("Remote - Poland"), ["PL"]);
    assert.deepEqual(normalizeLocation("Remote - Poland").remoteRegions, ["PL"]);
    assert.deepEqual(countries("Remote (US)"), ["US"]);
    assert.deepEqual(countries("Remote, Nigeria"), ["NG"]);
  });
});
