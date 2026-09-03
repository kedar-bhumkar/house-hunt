// Sample market configuration. The listings in page.tsx are fictional, so the
// city, boundary and amenities here are placeholders too -- point them at a real
// market and supply real addresses to use this dashboard for an actual search.
export const market = {
  city: "Sample City",
  state: "ST",
  label: "SAMPLE CITY",
  center: { lat: 39.83, lng: -98.58 },
};

export const qualifiedAddress = (address: string) => `${address}, ${market.city}, ${market.state}`;

export const boundary = [
  [-98.640, 39.865], [-98.620, 39.887], [-98.560, 39.882], [-98.516, 39.855], [-98.508, 39.804],
  [-98.546, 39.772], [-98.601, 39.769], [-98.643, 39.797], [-98.653, 39.835],
];

export const amenities = [
  { name:"Town Center Mall", kind:"Shopping", lat:39.834, lng:-98.548 }, { name:"Northside Market", kind:"Grocery", lat:39.859, lng:-98.546 },
  { name:"Village Grocer", kind:"Grocery", lat:39.849, lng:-98.572 }, { name:"Creekside Park", kind:"Park", lat:39.838, lng:-98.588 },
  { name:"Round Meadow Park", kind:"Park", lat:39.835, lng:-98.611 }, { name:"Eastside Park", kind:"Park", lat:39.859, lng:-98.532 },
  { name:"Mirror Lake", kind:"Lake", lat:39.804, lng:-98.582 }, { name:"Willow Lake", kind:"Lake", lat:39.782, lng:-98.599 },
  { name:"Riverside High", kind:"School", lat:39.822, lng:-98.613 }, { name:"Central Middle", kind:"School", lat:39.838, lng:-98.578 },
  { name:"Community Center", kind:"Sports", lat:39.842, lng:-98.614 }, { name:"Eastside Fitness", kind:"Sports", lat:39.844, lng:-98.536 },
];
