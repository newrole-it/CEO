import { describe, expect, it } from "vitest"
import {
  blocksForPrefix,
  boardsFromLines,
  parseClusterLine,
  PLATFORMS,
  surtHost,
  type ClusterLine,
} from "./commoncrawl"

const platform = (provider: string) => PLATFORMS.find((item) => item.provider === provider)!
const line = (url: string, status = "200") =>
  `${surtHost(new URL(url).hostname)})${new URL(url).pathname} 20261005124020 ${JSON.stringify({
    url,
    status,
  })}`

describe("Common Crawl index", () => {
  it("orders hosts the way the index keys them", () => {
    expect(surtHost("kubo.traffit.com")).toBe("com,traffit,kubo")
    expect(
      parseClusterLine("com,traffit,kubo)/career 20261005124020\tcdx-00123.gz\t250267\t251048\t2")
    ).toEqual({
      key: "com,traffit,kubo)/career",
      file: "cdx-00123.gz",
      offset: 250267,
      length: 251048,
    })
  })

  it("picks the block where a prefix begins and every block that starts inside it", () => {
    const index: ClusterLine[] = [
      "com,shop)/",
      "com,traffit)/",
      "com,traffit,kubo)/",
      "com,traffit,zen)/",
      "com,uber)/",
    ].map((key, at) => ({ key, file: "cdx-00001.gz", offset: at * 10, length: 10 }))
    expect(blocksForPrefix(index, "com,traffit,").map((block) => block.key)).toEqual([
      "com,traffit)/",
      "com,traffit,kubo)/",
      "com,traffit,zen)/",
    ])
  })

  it("reads board ids from archived addresses and skips the platforms' own hosts", () => {
    expect(
      [
        ...boardsFromLines(
          [
            line("https://kubo.traffit.com/public/an/123"),
            line("https://www.traffit.com/pl/"),
            line("https://gone.traffit.com/career/", "404"),
            line("https://walled.traffit.com/career/", "403"),
          ],
          platform("TRAFFIT")
        ),
      ].sort()
    ).toEqual(["kubo", "walled"])
    expect([
      ...boardsFromLines(
        [
          line("https://motorolasolutions.wd5.myworkdayjobs.com/en-US/Careers/job/Krakow/X_R1"),
          line("https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/External/jobs"),
        ],
        platform("WORKDAY")
      ),
    ]).toEqual(["motorolasolutions/wd5/Careers"])
    expect(
      [
        ...boardsFromLines(
          [line("https://jobs.eu.lever.co/xtb/123"), line("https://jobs.lever.co/Acme/456")],
          platform("LEVER")
        ),
      ].sort()
    ).toEqual(["acme", "eu:xtb"])
    expect([
      ...boardsFromLines(
        [
          line("https://boards.greenhouse.io/paddle", "301"),
          line("https://job-boards.greenhouse.io/acme/jobs/1"),
        ],
        platform("GREENHOUSE")
      ),
    ]).toEqual(["acme"])
    expect([
      ...boardsFromLines(
        [line("https://insense.na.teamtailor.com/jobs/1"), line("https://app.teamtailor.com/x")],
        platform("TEAMTAILOR")
      ),
    ]).toEqual(["insense.na.teamtailor.com"])
    expect([
      ...boardsFromLines(
        [line("https://apply.workable.com/j/ABC123"), line("https://apply.workable.com/flosum/")],
        platform("WORKABLE")
      ),
    ]).toEqual(["flosum"])
  })
})
