// Builds src/server/geo/cities.json, a city name → ISO country map, from GeoNames cities15000.txt
// (https://download.geonames.org/export/dump/, CC BY 4.0, see sources/geonames-NOTICE.md).
// Usage: node scripts/gen-cities.mjs path/to/cities15000.txt
// Kept: cities of 100,000+ people by their name and ASCII name; alternate Latin-script names for
// cities of 300,000+. A name two countries share is dropped unless the larger city is at least four
// times the size of the next, so "Valencia" (Spain, Venezuela) maps to nothing.
import { readFileSync, writeFileSync } from "node:fs"

const [file] = process.argv.slice(2)
if (!file) throw new Error("Give the path to cities15000.txt")
const fold = (s) => s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
const best = new Map() // name → [{country, population}]
for (const line of readFileSync(file, "utf8").split("\n")) {
  const cols = line.split("\t")
  if (cols.length < 15) continue
  const population = Number(cols[14])
  if (!(population >= 100_000)) continue
  const country = cols[8]
  const names = new Set([cols[1], cols[2]])
  if (population >= 300_000) {
    for (const alt of cols[3].split(","))
      if (/^[\p{Script=Latin} .'-]{4,40}$/u.test(alt)) names.add(alt)
  }
  for (const raw of names) {
    const name = fold(raw)
    if (name.length < 3) continue
    const list = best.get(name) ?? []
    const same = list.find((item) => item.country === country)
    if (same) same.population = Math.max(same.population, population)
    else list.push({ country, population })
    best.set(name, list)
  }
}
const out = {}
for (const [name, list] of [...best].sort((a, b) => a[0].localeCompare(b[0]))) {
  list.sort((a, b) => b.population - a.population)
  if (list.length > 1 && list[1].population * 4 > list[0].population) continue
  out[name] = list[0].country
}
writeFileSync(
  "src/server/geo/cities.json",
  JSON.stringify({
    _source: "GeoNames cities15000, CC BY 4.0, https://www.geonames.org",
    cities: out,
  }) + "\n"
)
console.log(Object.keys(out).length, "names")
