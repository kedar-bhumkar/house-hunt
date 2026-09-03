import HouseDashboard from "./house-dashboard";

export type House = {
  id: string; address: string; price: number; beds: number; baths: number;
  sqft: number; type: "Single family"; openHouse: string;
  openHouseStatus: "scheduled" | "not-published"; url: string; image?: string;
  listingStatus: "Active" | "Coming soon" | "Contingent" | "Pending" | "Off market";
  source: "Zillow" | "Homes.com" | "Redfin"; yearBuilt: number | null;
  isNew?: boolean;
};

const noOpen = { openHouse: "No upcoming time published", openHouseStatus: "not-published" as const };

// Sample inventory. These listings are fictional and exist only so the dashboard
// has something to render -- there is no scraper in this repo. Replace them with
// real listings, and update app/market.ts to match, to run an actual search.
// The scheduled refresh marks only homes first discovered in that refresh as
// isNew. They are promoted above the selected sort until the next refresh.
const houses: House[] = [
  { id:"1204-alder", address:"1204 Alder Ct", price:612000, beds:5, baths:4, sqft:3210, type:"Single family", source:"Zillow", yearBuilt:1988, listingStatus:"Active", ...noOpen, url:"https://example.com/listings/1204-alder" },
  { id:"3380-birchwood", address:"3380 Birchwood Dr", price:574500, beds:4, baths:3, sqft:2840, type:"Single family", source:"Homes.com", yearBuilt:1979, listingStatus:"Active", openHouse:"Sat–Sun, 1:00 PM–3:00 PM", openHouseStatus:"scheduled", url:"https://example.com/listings/3380-birchwood", isNew:true },
  { id:"812-cedar-hollow", address:"812 Cedar Hollow Rd", price:539900, beds:4, baths:3, sqft:2510, type:"Single family", source:"Zillow", yearBuilt:1984, listingStatus:"Pending", ...noOpen, url:"https://example.com/listings/812-cedar-hollow" },
  { id:"2117-dovetail", address:"2117 Dovetail Ln", price:525000, beds:4, baths:2.5, sqft:2460, type:"Single family", source:"Redfin", yearBuilt:1973, listingStatus:"Active", ...noOpen, url:"https://example.com/listings/2117-dovetail" },
  { id:"960-elmridge", address:"960 Elmridge Way", price:498000, beds:3, baths:3, sqft:2180, type:"Single family", source:"Zillow", yearBuilt:1991, listingStatus:"Contingent", ...noOpen, url:"https://example.com/listings/960-elmridge" },
  { id:"4455-fernbank", address:"4455 Fernbank Trl", price:462500, beds:4, baths:2, sqft:2035, type:"Single family", source:"Homes.com", yearBuilt:1977, listingStatus:"Active", ...noOpen, url:"https://example.com/listings/4455-fernbank", isNew:true },
  { id:"1738-glenmoor", address:"1738 Glenmoor Cir", price:429000, beds:3, baths:2, sqft:1760, type:"Single family", source:"Zillow", yearBuilt:1968, listingStatus:"Off market", ...noOpen, url:"https://example.com/listings/1738-glenmoor" },
  { id:"527-hawksbury", address:"527 Hawksbury Ave", price:398900, beds:3, baths:2, sqft:1545, type:"Single family", source:"Redfin", yearBuilt:1982, listingStatus:"Active", ...noOpen, url:"https://example.com/listings/527-hawksbury" },
];

export default function Home() { return <HouseDashboard houses={houses} />; }
