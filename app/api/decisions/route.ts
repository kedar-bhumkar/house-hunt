type Decision = { interest: string; action: string; notes: string };

const schemaSql = `CREATE TABLE IF NOT EXISTS house_decisions (
  owner_key TEXT NOT NULL,
  house_id TEXT NOT NULL,
  interest TEXT NOT NULL DEFAULT 'Undecided',
  action TEXT NOT NULL DEFAULT 'None',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_key, house_id)
)`;

const allowedInterest = new Set(["Undecided", "Interested", "Not interested"]);
const allowedAction = new Set(["None", "Further action", "Rejected"]);

function ownerKey(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() || "site-owner";
}

async function database() {
  const { env } = await import("cloudflare:workers");
  return env.DB;
}

async function ensureSchema(db: D1Database) {
  await db.prepare(schemaSql).run();
}

export async function GET(request: Request) {
  const db = await database();
  await ensureSchema(db);
  const result = await db.prepare(
    "SELECT house_id, interest, action, notes FROM house_decisions WHERE owner_key = ?",
  ).bind(ownerKey(request)).all();

  const decisions = Object.fromEntries(
    result.results.map((row) => [
      String(row.house_id),
      { interest: String(row.interest), action: String(row.action), notes: String(row.notes) },
    ]),
  );
  return Response.json({ decisions });
}

export async function PUT(request: Request) {
  const body = await request.json() as { houseId?: unknown; patch?: Partial<Decision>; decision?: Partial<Decision> };
  const houseId = typeof body.houseId === "string" ? body.houseId.trim() : "";
  const patch = body.patch ?? body.decision;
  const hasInterest = typeof patch?.interest !== "undefined";
  const hasAction = typeof patch?.action !== "undefined";
  const hasNotes = typeof patch?.notes !== "undefined";
  if (!houseId || !patch || (!hasInterest && !hasAction && !hasNotes)
    || (hasInterest && !allowedInterest.has(String(patch.interest)))
    || (hasAction && !allowedAction.has(String(patch.action)))
    || (hasNotes && typeof patch.notes !== "string")) {
    return Response.json({ error: "Invalid decision" }, { status: 400 });
  }

  const db = await database();
  await ensureSchema(db);
  const columns: string[] = [];
  const values: unknown[] = [];
  if (hasInterest) { columns.push("interest = ?"); values.push(patch.interest); }
  if (hasAction) { columns.push("action = ?"); values.push(patch.action); }
  if (hasNotes) { columns.push("notes = ?"); values.push(patch.notes); }
  columns.push("updated_at = ?");
  values.push(new Date().toISOString());

  await db.prepare("INSERT OR IGNORE INTO house_decisions (owner_key, house_id, interest, action, notes, updated_at) VALUES (?, ?, 'Undecided', 'None', '', ?)")
    .bind(ownerKey(request), houseId, new Date().toISOString()).run();
  await db.prepare(`UPDATE house_decisions SET ${columns.join(", ")} WHERE owner_key = ? AND house_id = ?`)
    .bind(...values, ownerKey(request), houseId).run();

  const row = await db.prepare("SELECT interest, action, notes FROM house_decisions WHERE owner_key = ? AND house_id = ?")
    .bind(ownerKey(request), houseId).first();

  return Response.json({ saved: true, houseId, decision: row });
}
