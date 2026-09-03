type ResearchStatus = "requested" | "complete" | "not-found";

const schemaSql = `CREATE TABLE IF NOT EXISTS property_research (
  owner_key TEXT NOT NULL,
  house_id TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  summary TEXT NOT NULL DEFAULT '',
  sources_checked TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_key, house_id)
)`;

const ownerKey = "site-owner";
const allowedStatuses = new Set<ResearchStatus>(["requested", "complete", "not-found"]);

async function database() {
  const { env } = await import("cloudflare:workers");
  return env.DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(schemaSql).run();
}

export async function GET() {
  const db = await database();
  await ensureSchema(db);
  const result = await db.prepare(
    "SELECT house_id, address, status, summary, sources_checked, checked_at, updated_at FROM property_research WHERE owner_key = ? ORDER BY updated_at DESC",
  ).bind(ownerKey).all();
  const research = Object.fromEntries(result.results.map((row) => [String(row.house_id), {
    houseId: String(row.house_id), address: String(row.address), status: String(row.status),
    summary: String(row.summary), sourcesChecked: String(row.sources_checked),
    checkedAt: String(row.checked_at), updatedAt: String(row.updated_at),
  }]));
  return Response.json({ research });
}

export async function PUT(request: Request) {
  const body = await request.json() as {
    houseId?: unknown; address?: unknown; status?: unknown; summary?: unknown;
    sourcesChecked?: unknown; checkedAt?: unknown;
  };
  const houseId = typeof body.houseId === "string" ? body.houseId.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const status = typeof body.status === "string" ? body.status as ResearchStatus : "requested";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const sourcesChecked = typeof body.sourcesChecked === "string" ? body.sourcesChecked.trim() : "";
  const checkedAt = typeof body.checkedAt === "string" ? body.checkedAt.trim() : "";
  if (!houseId || !address || !allowedStatuses.has(status) || summary.length > 5000 || sourcesChecked.length > 1000) {
    return Response.json({ error: "Invalid research record" }, { status: 400 });
  }
  const db = await database();
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO property_research
    (owner_key, house_id, address, status, summary, sources_checked, checked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_key, house_id) DO UPDATE SET
      address = excluded.address, status = excluded.status, summary = excluded.summary,
      sources_checked = excluded.sources_checked, checked_at = excluded.checked_at,
      updated_at = excluded.updated_at`)
    .bind(ownerKey, houseId, address, status, summary, sourcesChecked, checkedAt, now).run();
  return Response.json({ saved: true, houseId, status, updatedAt: now });
}
