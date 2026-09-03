// Published by the House Hunt research pass after a property is designated.
// Each entry must summarize verified address-specific findings without exposing
// source links in the dashboard. Keep an empty object when nothing is complete.
export const publishedResearch: Record<string, {
  houseId: string;
  address: string;
  status: "complete" | "not-found";
  summary: string;
  sourcesChecked: string;
  checkedAt: string;
  updatedAt: string;
}> = {
  "14886-tealwood": {
    houseId: "14886-tealwood",
    address: "14886 Tealwood Ct, Eden Prairie, MN",
    status: "complete",
    summary: "No police incident brief, crime alert, or reputable local-news report tied to this exact address was found in the public search. This does not prove that no incident has ever occurred; the public crime map and some police, court, and recorded-document systems cannot be exhaustively searched by street address. Public listing and property sources identify a detached single-family home built in 1983 on approximately 0.45 acre. NorthstarMLS history shows it listed for $600,000 on July 24, 2026, reduced to $579,900 on August 7 and to $559,900 on August 26. Public-record data reports a 2025 assessed value of $545,800 and 2025 property taxes of $6,920. Accessible permit history shows a plumbing replacement finalized October 9, 2023; permit data may be incomplete, so confirm recent roof, furnace, and gutter work and any open permits directly with Eden Prairie before purchase. No material adverse exact-address property-history record surfaced in the accessible results.",
    sourcesChecked: "Eden Prairie Police Department crime reports, incident briefs, crime alerts and Community Crime Map; Eden Prairie Local News and local-news web archives; Hennepin County Property Information Search; Hennepin County land-title and RecordEASE resources; Minnesota Court Records Online availability; Eden Prairie public documents; Homes.com, Redfin, Realtor.com, Zillow, Compass and NorthstarMLS property, permit, assessment and listing history",
    checkedAt: "Aug 28, 2026 · 2:01 AM CDT",
    updatedAt: "2026-08-28T07:01:14.000Z",
  },
  "10465-olympic": {
    houseId: "10465-olympic",
    address: "10465 Olympic Cir, Eden Prairie, MN",
    status: "complete",
    summary: "No crime report, police incident brief, or reputable local-news report tied to this exact address was found in the public search. This does not prove that no incident has ever occurred; some police, court, and recorded-document records are not searchable by street address. Current public listing and property sources identify a detached single-family home built in 1976 on approximately 0.54 acre, newly listed on August 27, 2026 for $500,000. Accessible permit history shows a mechanical permit finalized June 20, 2024 and a November 27, 2018 gas/remodel permit still labeled Active. Public permit data may be incomplete or stale, so confirm whether that 2018 permit remains open directly with Eden Prairie before purchase. No material adverse exact-address property-history record surfaced in the accessible results.",
    sourcesChecked: "Eden Prairie Police Department crime reports, incident briefs, crime alerts and Community Crime Map; Eden Prairie Local News and local-news web archives; Hennepin County Property Information Search; Hennepin County land-title and RecordEASE resources; Minnesota Court Records Online availability; Eden Prairie public documents; Redfin, Realtor.com, Homes.com, Zillow, Edina Realty and NorthstarMLS property, permit and listing history",
    checkedAt: "Aug 27, 2026 · 2:01 PM CDT",
    updatedAt: "2026-08-27T19:01:55.000Z",
  },
  "12738-gordon": {
    houseId: "12738-gordon",
    address: "12738 Gordon Dr, Eden Prairie, MN",
    status: "complete",
    summary: "No crime report, police incident brief, or reputable local-news report tied to this exact address was found in the public search. This does not prove that no incident has ever occurred; some police, court, and recorded-document records are not searchable by street address. Property and MLS sources identify a detached single-family home built in 1977 on 0.51 acre, sold for $282,900 on December 9, 2014, and listed on August 11, 2026 for $574,900. Current listing sources report annual property taxes of $5,783. No exact-address permit issue or material adverse property-history record surfaced in the accessible results; confirm open permits and recorded documents directly with Eden Prairie and Hennepin County before purchase.",
    sourcesChecked: "Eden Prairie Police Department crime reports, incident briefs, crime alerts and Community Crime Map; Eden Prairie Local News and local-news web archives; Hennepin County Property Information Search; Hennepin County land-title and RecordEASE resources; Minnesota Court Records Online availability; Zillow, Realtor.com, Coldwell Banker, Compass and NorthstarMLS property, tax and sale history",
    checkedAt: "Aug 23, 2026 · 2:04 PM CDT",
    updatedAt: "2026-08-23T19:04:26.000Z",
  },
  "10298-mooer": {
    houseId: "10298-mooer",
    address: "10298 Mooer Ln, Eden Prairie, MN",
    status: "not-found",
    summary: "No crime report, police incident brief, or reputable local-news report tied to this exact address was found in the public search. This does not prove that no incident has ever occurred; some police and court records are not searchable by street address. Property sources identify a detached single-family home built in 1984, with a July 2026 listing and later price reductions to $449,900. No material adverse property-history record tied to the exact address surfaced in the accessible results.",
    sourcesChecked: "Eden Prairie Police Department incident briefs and crime alerts; Eden Prairie Local News and local-news web archives; Hennepin County Property Information Search; Hennepin County land-title and RecordEASE resources; Minnesota Court Records Online availability; Zillow, Edina Realty and MLS listing history",
    checkedAt: "Aug 22, 2026 · 6:01 PM CDT",
    updatedAt: "2026-08-22T23:01:39.000Z",
  },
  "8522-darnel": {
    houseId: "8522-darnel",
    address: "8522 Darnel Rd, Eden Prairie, MN",
    status: "complete",
    summary: "No crime report, police incident brief, or reputable local-news report tied to this exact address was found. This does not prove that no incident has ever occurred; some police and court records are not searchable by street address. Public-record and MLS history identifies a detached home built in 1978, sold for $197,000 in 2000, $221,000 in 2008, and $349,990 in 2016. The accessible permit history lists 14 records, including a finalized 2022 solar installation and a residential foundation permit issued July 10, 2026. Permit data may be incomplete, so confirm open or unresolved work directly with Eden Prairie before purchase.",
    sourcesChecked: "Eden Prairie Police Department incident briefs, crime alerts and Community Crime Map; Eden Prairie Local News and local-news web archives; Hennepin County Property Information Search; Hennepin County land-title and RecordEASE resources; Minnesota Court Records Online availability; Realtor.com public-record permit, tax and sale history; Zillow and NorthstarMLS listing history",
    checkedAt: "Aug 22, 2026 · 8:04 PM CDT",
    updatedAt: "2026-08-23T01:04:31.000Z",
  },
};
