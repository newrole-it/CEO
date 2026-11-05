/** Convenience pipeline: raw postings → normalized → deduped → scored & ranked. */
import { DEFAULT_CONFIG, type MatchingConfig } from "@newrole/matching/config";
import { dedupePostings } from "@newrole/matching/dedupe";
import { normalizePosting } from "@newrole/matching/normalization";
import { rankPostings } from "./scoring";
import { RawPostingSchema, type MatchProfile, type RawPosting } from "@newrole/matching/types";

export function runMatching(raws: RawPosting[], profile: MatchProfile, now: Date, cfg: MatchingConfig = DEFAULT_CONFIG) {
  const normalized = raws.map((r) => normalizePosting(RawPostingSchema.parse(r), cfg));
  const { postings, merges } = dedupePostings(normalized);
  const ranked = rankPostings(postings, profile, now);
  return { postings, merges, ranked };
}
