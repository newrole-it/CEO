/** Convenience pipeline: raw postings → normalized → deduped → scored & ranked. */
import { DEFAULT_CONFIG, type MatchingConfig } from "./config";
import { dedupePostings } from "./dedupe";
import { normalizePosting } from "./normalization";
import { rankPostings } from "./scoring";
import { RawPostingSchema, type MatchProfile, type RawPosting } from "./types";

export function runMatching(raws: RawPosting[], profile: MatchProfile, now: Date, cfg: MatchingConfig = DEFAULT_CONFIG) {
  const normalized = raws.map((r) => normalizePosting(RawPostingSchema.parse(r), cfg));
  const { postings, merges } = dedupePostings(normalized);
  const ranked = rankPostings(postings, profile, now);
  return { postings, merges, ranked };
}
