import { mkdtemp, readdir, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import { join } from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { letterSection } from "@newrole/cv-core/schema"
import type { LlmClient } from "@newrole/llm/common"
import { addOfferByHand } from "./offers"
import {
  createDocument,
  listDocuments,
  listVersions,
  restoreVersion,
  StoreError,
  updateDocument,
} from "./store"
import { letterForOffer, tailorForOffer, WritingError } from "./writing"

let dir = ""

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "newrole-cv-test-"))
  process.env.NEWROLE_CV_DATA = dir
})

afterAll(async () => {
  delete process.env.NEWROLE_CV_DATA
  await rm(dir, { recursive: true, force: true })
})

function fakeLlm(...replies: unknown[]): LlmClient & { users: string[] } {
  const users: string[] = []
  return {
    model: "fake",
    users,
    async completeJson(args) {
      users.push(args.user)
      const data = replies[Math.min(users.length - 1, replies.length - 1)]
      if (data == null) return null
      return { data: args.schema.parse(data), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

const reply = (body: string) => ({
  headline: "Platform Engineering Lead",
  sections: [{ id: "profile", body }],
  changes: ["Profil pod platformy."],
  gaps: ["Go"],
})

describe("newrole CV, from an offer to a tailored CV and a letter", () => {
  it("refuses to tailor before there is a CV", async () => {
    const offer = await addOfferByHand({ company: "Acme", title: "Staff Engineer" })
    await expect(
      tailorForOffer({ offerId: offer.id, llm: fakeLlm(reply("x")) })
    ).rejects.toMatchObject({ code: "no-base" })
  })

  it("writes one CV per offer, keeps edits in history and restores them", async () => {
    const base = await createDocument({ title: "Moje CV", language: "pl", content: syntheticCv(2) })
    const offer = await addOfferByHand({ company: "Acme", title: "Staff Engineer" })
    const llm = fakeLlm(reply("Buduję platformy."))
    const first = await tailorForOffer({ offerId: offer.id, note: "Wymagamy Kubernetes", llm })
    expect(first.content.header.headline).toBe("Platform Engineering Lead")
    expect(first.content.header.email).toBe(base.content.header.email)
    expect(first.notes.offerText).toEqual({ origin: "none", chars: 0, note: true })
    expect(llm.users[0]).toContain("<untrusted_candidate_note>\nWymagamy Kubernetes")
    expect((await listVersions(first.id))?.map((v) => [v.number, v.origin, v.isCurrent])).toEqual([
      [2, "generated", true],
      [1, "base", false],
    ])

    // the person edits it, then asks for another take
    const edited = await updateDocument(first.id, {
      content: { ...first.content, header: { ...first.content.header, headline: "Mój nagłówek" } },
      baseUpdatedAt: first.updatedAt,
    })
    const again = fakeLlm(reply("Drugie podejście."))
    const second = await tailorForOffer({ offerId: offer.id, llm: again })
    expect(second.id).toBe(first.id)
    expect(again.users[0]).toMatch(/Attempt 2/)
    expect(again.users[0]).not.toContain("Mój nagłówek")
    const versions = (await listVersions(first.id)) ?? []
    expect(versions.map((v) => v.origin)).toEqual(["generated", "auto", "generated", "base"])

    // a stale tab cannot overwrite the new take
    await expect(
      updateDocument(first.id, { title: "x", baseUpdatedAt: edited.updatedAt })
    ).rejects.toMatchObject({ code: "conflict" })

    const restored = await restoreVersion(first.id, versions[1].id)
    expect(restored?.content.header.headline).toBe("Mój nagłówek")
  })

  it("writes the letter from the tailored CV", async () => {
    const offer = await addOfferByHand({ company: "Beta", title: "Data Engineer" })
    await tailorForOffer({ offerId: offer.id, llm: fakeLlm(reply("Dane.")) })
    const llm = fakeLlm({
      paragraphs: ["Piszę w sprawie roli Data Engineer.", "Prowadziłem zespół."],
    })
    const letter = await letterForOffer({ offerId: offer.id, llm })
    expect(letterSection(letter.content)?.paragraphs[0]).toBe("Piszę w sprawie roli Data Engineer.")
    expect(llm.users[0]).toMatch(/Platform Engineering Lead/)
    const titles = (await listDocuments()).map((doc) => doc.title)
    expect(titles).toContain("Beta · Data Engineer")
  })

  it("fails without a model and stores nothing", async () => {
    const offer = await addOfferByHand({ company: "Gamma", title: "QA" })
    const before = (await listDocuments()).length
    await expect(tailorForOffer({ offerId: offer.id, llm: null })).rejects.toBeInstanceOf(
      WritingError
    )
    await expect(tailorForOffer({ offerId: offer.id, llm: fakeLlm(null) })).rejects.toMatchObject({
      code: "llm-failed",
    })
    expect((await listDocuments()).length).toBe(before)
  })

  it("keeps no offer text on disk and never reads a path from an id", async () => {
    for (const name of await readdir(join(dir, "offers"))) {
      const offer = JSON.parse(await readFile(join(dir, "offers", name), "utf8"))
      expect(Object.keys(offer)).not.toContain("text")
    }
    await expect(updateDocument("../../etc/passwd", { title: "x" })).rejects.toBeInstanceOf(
      StoreError
    )
  })
})
