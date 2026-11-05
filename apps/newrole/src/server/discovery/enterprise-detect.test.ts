import { describe, expect, it } from "vitest"
import { classifyHit, detectBoard } from "./boards"
import { findAtsMarkers } from "./careers-detect"

describe("enterprise ATS detection", () => {
  it("detects boards from vendor URLs", () => {
    expect(detectBoard("https://jobs.jobvite.com/acme/job/oXk7ifwL")).toEqual({
      provider: "JOBVITE",
      boardId: "acme",
    })
    expect(detectBoard("https://jobs.jobvite.com/careers/acme/jobs")).toEqual({
      provider: "JOBVITE",
      boardId: "acme",
    })
    expect(detectBoard("https://careers-teleperformance.icims.com/jobs/65338/x/job")).toBeNull()
    expect(detectBoard("https://cisco.avature.net/careers/JobDetail/Engineer/1")).toEqual({
      provider: "AVATURE",
      boardId: "cisco.avature.net",
    })
    expect(detectBoard("https://zabka.pracujunas.pl/oferty")).toEqual({
      provider: "ERECRUITER",
      boardId: "zabka",
    })
    expect(
      detectBoard("https://skk.erecruiter.pl/Offer.aspx?oid=1&cfg=4D3DD27FCA3D40C79E01BEE9745902B7")
    ).toEqual({
      provider: "ERECRUITER",
      boardId: "4d3dd27fca3d40c79e01bee9745902b7",
    })
    expect(
      detectBoard("https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=abc")
    ).toBeNull()
    expect(classifyHit("https://cisco.avature.net/careers")).toEqual({
      kind: "ats",
      provider: "AVATURE",
      boardId: "cisco.avature.net",
    })
  })

  it("reads the eRecruiter widget cfg and keeps apply forms link-only", () => {
    const html = `<script type='text/javascript' src='https://skk.erecruiter.pl/Code.ashx?cfg=4D3DD27FCA3D40C79E01BEE9745902B7'></script>
      <a href="https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=1">Aplikuj</a>`
    const markers = findAtsMarkers(html, "https://echo.com.pl/kariera")
    expect(markers).toContainEqual(
      expect.objectContaining({
        kind: "board",
        provider: "ERECRUITER",
        boardId: "4D3DD27FCA3D40C79E01BEE9745902B7",
      })
    )
    expect(markers).toContainEqual(
      expect.objectContaining({ kind: "link-only", vendor: "eRecruiter" })
    )
  })

  it("recognises Phenom and Avature pages from their assets when no board URL is present", () => {
    const phenom = findAtsMarkers(
      `<script src="https://cdn.phenompeople.com/CareerConnectResources/x.js"></script>`,
      "https://careers.dhl.com/global/en"
    )
    expect(phenom).toEqual([
      expect.objectContaining({ provider: "PHENOM", boardId: "careers.dhl.com" }),
    ])
    const avature = findAtsMarkers(
      `<a href="/global/JobDetail/Wroclaw-Agent/62533">Agent</a>`,
      "https://careers.qatarairways.com/global"
    )
    expect(avature).toEqual([
      expect.objectContaining({ provider: "AVATURE", boardId: "careers.qatarairways.com" }),
    ])
    expect(findAtsMarkers("<p>nothing</p>", "https://acme.pl/")).toEqual([])
  })
})
