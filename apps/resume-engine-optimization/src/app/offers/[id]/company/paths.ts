/** Where an offer's company brief lives (/offers/[id]/company). */
export function companyBriefPath(jobId: string): string {
  return `/offers/${encodeURIComponent(jobId)}/company`
}
