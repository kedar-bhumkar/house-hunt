import type { NegotiationSimulation, SimulationConfig, SimulationProperty } from "../../negotiation-types";
import { advanceSimulation, clientView, newSimulation } from "./engine";

const ownerKey = "site-owner";

type RuntimeEnv = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  NEGOTIATION_ACCESS_KEY?: string;
  NEGOTIATION_KEY?: string;
};

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAccessValue(value: string) {
  const trimmed = value.trim();
  const quoted = (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

function authorized(request: Request, env: RuntimeEnv, bodyAccessKey = "") {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7) : "";
  const supplied = normalizeAccessValue(bodyAccessKey || bearer || request.headers.get("x-negotiation-access") || "");
  const expected = normalizeAccessValue(env.NEGOTIATION_ACCESS_KEY || env.NEGOTIATION_KEY || "");
  if (!supplied || !expected || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function configuration(env: RuntimeEnv) {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    hasApiKey: Boolean(env.OPENAI_API_KEY),
    hasAccessKey: Boolean(env.NEGOTIATION_ACCESS_KEY || env.NEGOTIATION_KEY),
    model: env.OPENAI_MODEL || "gpt-5.6-terra",
  };
}

function parseProperty(value: unknown): SimulationProperty | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const property: SimulationProperty = {
    houseId: cleanString(source.houseId, 100),
    address: cleanString(source.address, 240),
    listingUrl: cleanString(source.listingUrl, 1000),
    listPrice: finite(source.listPrice),
    beds: finite(source.beds),
    baths: finite(source.baths),
    sqft: finite(source.sqft),
    yearBuilt: source.yearBuilt === null ? null : finite(source.yearBuilt),
    listingStatus: cleanString(source.listingStatus, 80),
    source: cleanString(source.source, 80),
    backgroundResearch: cleanString(source.backgroundResearch, 8_000),
  };
  if (!property.houseId || !property.address || property.listPrice < 50_000 || property.sqft < 100 || !/^https:\/\//.test(property.listingUrl)) return null;
  return property;
}

function parseConfig(value: unknown, listPrice: number): SimulationConfig | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const inclination = cleanString(source.inclination, 20);
  const config: SimulationConfig = {
    downPaymentPercent: finite(source.downPaymentPercent, 10),
    interestRateMin: finite(source.interestRateMin, 6.25),
    interestRateMax: finite(source.interestRateMax, 6.75),
    maximumMonthlyPayment: finite(source.maximumMonthlyPayment, 0),
    walkAwayPrice: finite(source.walkAwayPrice, listPrice),
    closeDealBuffer: finite(source.closeDealBuffer, 5_000),
    enforceBuyerWalkAway: booleanValue(source.enforceBuyerWalkAway),
    enforceBuyerPaymentCap: booleanValue(source.enforceBuyerPaymentCap),
    pinBuyerAcceptanceToLatestSeller: booleanValue(source.pinBuyerAcceptanceToLatestSeller),
    enforceSellerAutoReject: booleanValue(source.enforceSellerAutoReject),
    rewriteSellerAcceptanceBelowMinimum: booleanValue(source.rewriteSellerAcceptanceBelowMinimum),
    rewriteSellerRejectionOfAcceptableOffer: booleanValue(source.rewriteSellerRejectionOfAcceptableOffer),
    inclination: (["low", "medium", "high", "must-have"].includes(inclination) ? inclination : "medium") as SimulationConfig["inclination"],
    maxRounds: Math.round(finite(source.maxRounds, 4)),
    maxTokens: Math.round(finite(source.maxTokens, 120_000)),
    maxCostUsd: finite(source.maxCostUsd, 2),
    propWireText: cleanString(source.propWireText, 24_000),
  };
  const valid = config.downPaymentPercent >= 0 && config.downPaymentPercent <= 100
    && config.interestRateMin >= 0 && config.interestRateMax >= config.interestRateMin && config.interestRateMax <= 20
    && config.walkAwayPrice >= listPrice * 0.5 && config.walkAwayPrice <= listPrice * 1.5
    && config.closeDealBuffer >= 0 && config.closeDealBuffer <= 15_000
    && config.maximumMonthlyPayment >= 0 && config.maximumMonthlyPayment <= 25_000
    && config.maxRounds >= 1 && config.maxRounds <= 8
    && config.maxTokens >= 20_000 && config.maxTokens <= 400_000
    && config.maxCostUsd >= 0.25 && config.maxCostUsd <= 15;
  return valid ? config : null;
}

function parseState(row: Record<string, unknown> | null): NegotiationSimulation | null {
  if (!row || typeof row.state_json !== "string") return null;
  try { return JSON.parse(row.state_json) as NegotiationSimulation; }
  catch { return null; }
}

async function save(db: D1Database, state: NegotiationSimulation) {
  await db.prepare(`UPDATE negotiation_simulations
    SET status = ?, state_json = ?, updated_at = ?
    WHERE owner_key = ? AND id = ?`)
    .bind(state.status, JSON.stringify(state), state.updatedAt, ownerKey, state.id).run();
}

export async function GET(request: Request) {
  const env = await runtime();
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") {
    return Response.json(configuration(env), { headers: { "cache-control": "no-store" } });
  }
  if (!authorized(request, env)) return Response.json({ error: "Invalid negotiation access passphrase." }, { status: 401 });
  const id = cleanString(url.searchParams.get("id"), 100);
  const houseId = cleanString(url.searchParams.get("houseId"), 100);
  if (!id && !houseId) return Response.json({ error: "A simulation or house id is required." }, { status: 400 });
  const row = id
    ? await env.DB.prepare("SELECT state_json FROM negotiation_simulations WHERE owner_key = ? AND id = ?").bind(ownerKey, id).first()
    : await env.DB.prepare("SELECT state_json FROM negotiation_simulations WHERE owner_key = ? AND house_id = ? ORDER BY created_at DESC LIMIT 1").bind(ownerKey, houseId).first();
  const state = parseState(row as Record<string, unknown> | null);
  return Response.json({ ...configuration(env), simulation: state ? clientView(state) : null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const env = await runtime();
  if (!env.OPENAI_API_KEY) {
    return Response.json({ error: "The OpenAI API key is not configured.", code: "NEGOTIATION_NOT_CONFIGURED" }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
  if (!authorized(request, env, cleanString(body.accessKey, 128))) {
    return Response.json({ error: "Invalid negotiation access passphrase." }, { status: 401 });
  }
  if (body.action === "load-latest") {
    const houseId = cleanString(body.houseId, 100);
    if (!houseId) return Response.json({ error: "A house id is required." }, { status: 400 });
    const row = await env.DB.prepare("SELECT state_json FROM negotiation_simulations WHERE owner_key = ? AND house_id = ? ORDER BY created_at DESC LIMIT 1").bind(ownerKey, houseId).first();
    const state = parseState(row as Record<string, unknown> | null);
    return Response.json({ ...configuration(env), simulation: state ? clientView(state) : null }, { headers: { "cache-control": "no-store" } });
  }
  const property = parseProperty(body.property);
  const config = property ? parseConfig(body.config, property.listPrice) : null;
  if (!property || !config) return Response.json({ error: "Invalid property or simulation settings." }, { status: 400 });
  const state = newSimulation(crypto.randomUUID(), property, config);
  await env.DB.prepare(`INSERT INTO negotiation_simulations
    (owner_key, id, house_id, status, state_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(ownerKey, state.id, property.houseId, state.status, JSON.stringify(state), state.createdAt, state.updatedAt).run();
  return Response.json({ simulation: clientView(state) }, { status: 201 });
}

export async function PUT(request: Request) {
  const env = await runtime();
  if (!env.OPENAI_API_KEY) {
    return Response.json({ error: "The OpenAI API key is not configured.", code: "NEGOTIATION_NOT_CONFIGURED" }, { status: 503 });
  }
  let body: { id?: unknown; accessKey?: unknown };
  try { body = await request.json() as { id?: unknown; accessKey?: unknown }; }
  catch { return Response.json({ error: "Invalid JSON request." }, { status: 400 }); }
  if (!authorized(request, env, cleanString(body.accessKey, 128))) {
    return Response.json({ error: "Invalid negotiation access passphrase." }, { status: 401 });
  }
  const id = cleanString(body.id, 100);
  if (!id) return Response.json({ error: "A simulation id is required." }, { status: 400 });
  const row = await env.DB.prepare("SELECT state_json FROM negotiation_simulations WHERE owner_key = ? AND id = ?").bind(ownerKey, id).first();
  const state = parseState(row as Record<string, unknown> | null);
  if (!state) return Response.json({ error: "Simulation not found." }, { status: 404 });
  try {
    await advanceSimulation(state, env.OPENAI_API_KEY, env.OPENAI_MODEL || "gpt-5.6-terra");
  } catch (error) {
    state.status = "paused";
    state.error = error instanceof Error ? error.message.slice(0, 500) : "The simulation step failed.";
    state.stepLabel = "Paused after an API error";
    state.updatedAt = new Date().toISOString();
  }
  await save(env.DB, state);
  return Response.json({ simulation: clientView(state) });
}
