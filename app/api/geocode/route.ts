const censusEndpoint = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

type Coordinate = { lat: number; lng: number } | null;

async function geocode(address: string): Promise<[string, Coordinate]> {
  const query = new URLSearchParams({
    address: `${address}, Eden Prairie, MN`,
    benchmark: "Public_AR_Current",
    format: "json",
  });
  try {
    const response = await fetch(`${censusEndpoint}?${query}`, { headers: { "user-agent": "House Hunt dashboard" } });
    if (!response.ok) return [address, null];
    const body = await response.json() as { result?: { addressMatches?: Array<{ coordinates?: { x: number; y: number } }> } };
    const point = body.result?.addressMatches?.[0]?.coordinates;
    return [address, point ? { lat: point.y, lng: point.x } : null];
  } catch { return [address, null]; }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { addresses?: unknown };
  if (!Array.isArray(body.addresses) || body.addresses.length > 80) {
    return Response.json({ error: "Provide up to 80 addresses." }, { status: 400 });
  }
  const addresses = [...new Set(body.addresses.filter((item): item is string => typeof item === "string" && item.length <= 120))];
  const entries: Array<[string, Coordinate]> = [];
  for (let index = 0; index < addresses.length; index += 12) {
    entries.push(...await Promise.all(addresses.slice(index, index + 12).map(geocode)));
  }
  return Response.json({ coordinates: Object.fromEntries(entries) }, { headers: { "cache-control": "public, max-age=604800" } });
}
