// Published by the House Hunt research pass after a property is designated.
// Each entry must summarize verified address-specific findings without exposing
// source links in the dashboard. Keep an empty object when nothing is complete.
// The entries below are sample records matching the fictional listings in
// page.tsx; replace them with real findings.
export const publishedResearch: Record<string, {
  houseId: string;
  address: string;
  status: "complete" | "not-found";
  summary: string;
  sourcesChecked: string;
  checkedAt: string;
  updatedAt: string;
}> = {
  "812-cedar-hollow": {
    houseId: "812-cedar-hollow",
    address: "812 Cedar Hollow Rd, Sample City, ST",
    status: "complete",
    summary: "Sample record. No police incident brief, crime alert, or reputable local-news report tied to this exact address was found in the public search. This does not prove that no incident has ever occurred; the public crime map and some police, court, and recorded-document systems cannot be exhaustively searched by street address. Public listing and property sources identify a detached single-family home built in 1984 on approximately 0.4 acre, listed at $565,000 and later reduced to $539,900. Accessible permit history shows a plumbing replacement finalized two years ago; permit data may be incomplete, so confirm recent roof, furnace, and gutter work and any open permits directly with the city before purchase.",
    sourcesChecked: "City police department crime reports, incident briefs, crime alerts and community crime map; local-news web archives; county property information search; county land-title and recorded-document resources; state court records availability; city public documents; listing-site property, permit, assessment and listing history",
    checkedAt: "Sample record",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  "1738-glenmoor": {
    houseId: "1738-glenmoor",
    address: "1738 Glenmoor Cir, Sample City, ST",
    status: "not-found",
    summary: "Sample record. No crime report, police incident brief, or reputable local-news report tied to this exact address was found in the public search. This does not prove that no incident has ever occurred; some police and court records are not searchable by street address. Property sources identify a detached single-family home built in 1968, with an earlier listing and subsequent price reductions. No material adverse property-history record tied to the exact address surfaced in the accessible results.",
    sourcesChecked: "City police department incident briefs and crime alerts; local-news web archives; county property information search; county land-title and recorded-document resources; state court records availability; listing-site property and listing history",
    checkedAt: "Sample record",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};
