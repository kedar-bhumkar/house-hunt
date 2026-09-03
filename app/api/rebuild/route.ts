const schemaSql = `CREATE TABLE IF NOT EXISTS manual_rebuild (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'idle',
  requested_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT ''
)`;
const rebuildId = "current";

async function database() {
  const { env } = await import("cloudflare:workers");
  return env.DB;
}

async function expectedPin() {
  const { env } = await import("cloudflare:workers");
  return ((env as unknown as { REBUILD_PIN?: string }).REBUILD_PIN ?? "").trim();
}

async function ensureRow(db: D1Database) {
  await db.prepare(schemaSql).run();
  await db.prepare("INSERT OR IGNORE INTO manual_rebuild (id, status, requested_at, completed_at) VALUES (?, 'idle', '', '')").bind(rebuildId).run();
}

async function readState(db: D1Database) {
  const row = await db.prepare("SELECT status, requested_at, completed_at FROM manual_rebuild WHERE id = ?").bind(rebuildId).first();
  return { status: String(row?.status ?? "idle"), requestedAt: String(row?.requested_at ?? ""), completedAt: String(row?.completed_at ?? "") };
}

export async function GET(request: Request) {
  const db = await database();
  await ensureRow(db);
  const url = new URL(request.url);
  const pin = await expectedPin();
  if (pin && url.searchParams.get("action") === "complete" && url.searchParams.get("pin") === pin) {
    await db.prepare("UPDATE manual_rebuild SET status = 'complete', completed_at = ? WHERE id = ?").bind(new Date().toISOString(), rebuildId).run();
  }
  return Response.json(await readState(db), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json() as { pin?: unknown };
  const pin = await expectedPin();
  if (!pin || body.pin !== pin) return Response.json({ error: "Incorrect password" }, { status: 401 });
  const db = await database();
  await ensureRow(db);
  const requestedAt = new Date().toISOString();
  await db.prepare("UPDATE manual_rebuild SET status = 'requested', requested_at = ?, completed_at = '' WHERE id = ?").bind(requestedAt, rebuildId).run();
  return Response.json({ status: "requested", requestedAt, completedAt: "" });
}
