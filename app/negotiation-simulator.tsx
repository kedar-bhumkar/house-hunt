"use client";

import { useEffect, useMemo, useState } from "react";
import type { House } from "./page";
import type { Inclination, NegotiationAction, NegotiationSimulation, ScenarioName, ScenarioRun, SimulationConfig } from "./negotiation-types";
import { qualifiedAddress } from "./market";

type Props = {
  house: House;
  backgroundResearch: string;
  onClose: () => void;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const scenarioLabels: Record<ScenarioName, string> = { motivated: "Motivated seller", "market-aligned": "Market-aligned seller", firm: "Firm seller" };
const outcomeLabels: Record<string, string> = {
  AGREEMENT_REACHED: "Agreement reached",
  SELLER_REJECTED: "Seller rejected",
  BUYER_WALKED_AWAY: "Buyer walked away",
  STALEMATE: "Stalemate",
  ROUND_LIMIT_REACHED: "Round limit reached",
  TOKEN_BUDGET_EXHAUSTED: "Token budget reached",
  COST_BUDGET_EXHAUSTED: "Cost budget reached",
};

type RulebookItem = { id: string; owner: string; rule: string; trigger: string; result: string };

function rulebook(config: SimulationConfig): RulebookItem[] {
  const enforced = (value: boolean | undefined, strict: string, advisory: string) => value !== false ? strict : advisory;
  return [
    { id: "B0", owner: "Buyer", rule: "Disciplined opening ceiling", trigger: "Initial buyer move", result: "Set a legal opening below the walk-away price and preserve negotiation room" },
    { id: "B1", owner: "Buyer", rule: "Walk-away target", trigger: `Price reaches ${money.format(config.walkAwayPrice)}`, result: enforced(config.enforceBuyerWalkAway, "Enforced: stop ordinary price movement and evaluate only the close-deal buffer", "Advisory: model may proceed above the target") },
    { id: "B2", owner: "Buyer", rule: "Monthly-payment ceiling", trigger: config.maximumMonthlyPayment ? `Estimated payment above ${money.format(config.maximumMonthlyPayment)}/month` : "No payment ceiling supplied", result: config.maximumMonthlyPayment ? enforced(config.enforceBuyerPaymentCap, "Enforced: walk away automatically", "Advisory: record the overage without forcing walk-away") : "Not applicable" },
    { id: "B3", owner: "Buyer", rule: "Inclination strategy", trigger: `${config.inclination} inclination`, result: "Controls concession aggressiveness, never hard limits" },
    { id: "B4", owner: "Buyer", rule: "Evidence integrity", trigger: "Unsupported property fact, financing claim, or competing offer", result: "Disallow fabrication" },
    { id: "B5", owner: "Buyer", rule: "Terms discipline", trigger: "Inspection waiver or material term trade", result: "Require explicit justification" },
    { id: "B6", owner: "Buyer", rule: "Valid acceptance", trigger: "Buyer acceptance price differs from latest seller counter", result: enforced(config.pinBuyerAcceptanceToLatestSeller, "Enforced: pin acceptance to the latest seller counter", "Advisory: preserve the model’s stated acceptance price") },
    { id: "B7", owner: "Buyer", rule: "Close-deal buffer", trigger: `Seller is within ${money.format(config.closeDealBuffer ?? 5_000)} of the buyer’s latest offer`, result: `Bridge the small final gap when price stays at or below ${money.format(config.walkAwayPrice + (config.closeDealBuffer ?? 5_000))}, inspection remains, and affordability passes` },
    { id: "S1", owner: "Seller", rule: "Automatic-reject floor", trigger: "Buyer offer below scenario floor", result: enforced(config.enforceSellerAutoReject, "Enforced: reject without counter", "Advisory: allow the model’s response") },
    { id: "S2", owner: "Seller", rule: "Minimum acceptable price", trigger: "Attempted acceptance below scenario minimum", result: enforced(config.rewriteSellerAcceptanceBelowMinimum, "Enforced: replace with counter at minimum", "Advisory: allow acceptance below the scenario minimum") },
    { id: "S3", owner: "Seller", rule: "Rejecting an acceptable offer", trigger: "Seller rejects an offer at or above its minimum", result: enforced(config.rewriteSellerRejectionOfAcceptableOffer, "Enforced: rewrite rejection into a counter", "Advisory: allow the seller to reject") },
    { id: "S4", owner: "Seller", rule: "Concession budget", trigger: "Credits or concessions exceed scenario budget", result: "Reduce or reject concession" },
    { id: "S5", owner: "Seller", rule: "Evidence integrity", trigger: "Unsupported competition or seller-motive claim", result: "Disallow fabrication" },
    { id: "G1", owner: "Global", rule: "Round cap", trigger: `${config.maxRounds} seller responses in a scenario`, result: "End as round-limit reached" },
    { id: "G2", owner: "Global", rule: "Stalemate", trigger: "Both parties repeat their prices over two exchanges", result: "End as stalemate" },
    { id: "G3", owner: "Global", rule: "Token ceiling", trigger: `${config.maxTokens.toLocaleString()} total tokens`, result: "Stop every unfinished run" },
    { id: "G4", owner: "Global", rule: "Cost ceiling", trigger: `${money.format(config.maxCostUsd)} estimated total API cost`, result: "Stop every unfinished run" },
    { id: "G5", owner: "Global", rule: "Research freeze", trigger: "Negotiation begins", result: "No fresh web research during turns" },
    { id: "G6", owner: "Global", rule: "Agreement", trigger: "Valid acceptance within deterministic private limits", result: "Record final price and end run" },
    { id: "G7", owner: "Global", rule: "Curated PropWire reconciliation", trigger: config.propWireText.trim() ? "Pasted PropWire data is supplied" : "No PropWire data supplied", result: config.propWireText.trim() ? "Both agents must classify and use or explicitly exclude every relevant supplied comp and valuation fact" : "Not applicable" },
  ];
}

function turnJustification(simulation: NegotiationSimulation, run: ScenarioRun, turn: NegotiationAction, index: number) {
  if (!turn.decisionRecord.summary.startsWith("The deterministic negotiation guardrail overrode")) return turn.decisionRecord.summary;
  const priorTurns = run.transcript.slice(0, index);
  if (turn.actor === "buyer") {
    const seller = [...priorTurns].reverse().find((item) => item.actor === "seller");
    if (!seller?.price) return "The buyer action was blocked because it did not contain a valid price within the buyer’s approved limits. The guardrail selected walk-away instead.";
    const monthly = monthlyEstimate(seller.price, simulation.config);
    const priceGap = seller.price - simulation.config.walkAwayPrice;
    const paymentGap = simulation.config.maximumMonthlyPayment ? monthly - simulation.config.maximumMonthlyPayment : 0;
    const reasons = [priceGap > 0 ? `${money.format(seller.price)} was ${money.format(priceGap)} above the ${money.format(simulation.config.walkAwayPrice)} walk-away price` : "", paymentGap > 0 ? `${money.format(monthly)}/month was ${money.format(paymentGap)} above the payment cap` : ""].filter(Boolean);
    return `The seller’s latest ${seller.action.toLowerCase()} was ${money.format(seller.price)}: “${seller.publicMessage}” The buyer rejected it because ${reasons.join(" and ") || "it violated a private approved limit"}, then walked away.`;
  }
  const buyer = [...priorTurns].reverse().find((item) => item.actor === "buyer");
  if (!buyer?.price || !run.profile) return "The seller guardrail rejected or corrected the buyer action because it violated a private scenario threshold.";
  if (buyer.price < run.profile.automaticRejectBelow) return `The seller rejected the buyer’s ${money.format(buyer.price)} offer because it was ${money.format(run.profile.automaticRejectBelow - buyer.price)} below the ${money.format(run.profile.automaticRejectBelow)} automatic-reject floor. No counter was allowed under rule S1.`;
  if (buyer.price < run.profile.minimumAcceptablePrice) return `The buyer offered ${money.format(buyer.price)}, which was ${money.format(run.profile.minimumAcceptablePrice - buyer.price)} below the seller’s ${money.format(run.profile.minimumAcceptablePrice)} minimum acceptable price. The seller could counter but could not accept.`;
  return `The buyer’s ${money.format(buyer.price)} offer qualified for negotiation, so the guardrail kept the seller in the negotiation instead of allowing an unsupported rejection.`;
}

function reportMarkdown(simulation: NegotiationSimulation) {
  const lines = [`# Negotiation simulation — ${simulation.property.address}`, "", `Generated: ${simulation.updatedAt}`, `Status: ${simulation.status}`, "", "## Rules and exit criteria", ""];
  for (const item of rulebook(simulation.config)) lines.push(`- **${item.id} · ${item.owner} · ${item.rule}:** Trigger: ${item.trigger}. Result: ${item.result}.`);
  lines.push("", "## Research dossier", "");
  lines.push(`Curated PropWire input supplied: ${simulation.config.propWireText.trim() ? `${simulation.config.propWireText.length.toLocaleString()} characters` : "No"}.`, "");
  for (const report of [simulation.buyerResearch, simulation.sellerResearch].filter(Boolean)) {
    lines.push(`### ${report!.agent} research`, "", report!.summary, "", `Fair-value range: ${money.format(report!.fairValueLow)}–${money.format(report!.fairValueHigh)}`, "");
    lines.push(`**PropWire assessment:** ${report!.propWireAssessment ?? "Legacy run — no separate PropWire assessment was recorded."}`, "");
    for (const fact of report!.suppliedEvidence ?? []) lines.push(`- **${fact.id} · ${fact.disposition} · ${fact.priceSignal}:** ${fact.fact} Calculation: ${fact.calculation}. Rationale: ${fact.rationale}`);
    if ((report!.suppliedEvidence ?? []).length) lines.push("");
    for (const source of report!.sources) lines.push(`- [${source.title}](${source.url}) — ${source.claim}`);
    lines.push("");
  }
  for (const run of simulation.runs) {
    lines.push(`## ${scenarioLabels[run.scenario]}`, "", `Outcome: ${run.outcome ? outcomeLabels[run.outcome] : run.status}`, `Final price: ${run.finalPrice ? money.format(run.finalPrice) : "None"}`, "");
    if (run.profile) lines.push(`Private thresholds revealed after completion: auto-reject below ${money.format(run.profile.automaticRejectBelow)}; negotiate from ${money.format(run.profile.negotiationThreshold)}; minimum acceptable ${money.format(run.profile.minimumAcceptablePrice)}; preferred ${money.format(run.profile.preferredPrice)}.`, "");
    for (const [turnIndex, turn] of run.transcript.entries()) {
      lines.push(`### Round ${turn.round} — ${turn.actor.toUpperCase()} ${turn.action}${turn.price ? ` ${money.format(turn.price)}` : ""}`, "", `> ${turn.publicMessage}`, "", `**Justification:** ${turnJustification(simulation, run, turn, turnIndex)}`, "");
      if (turn.decisionRecord.evidenceReferences.length) lines.push(`- Evidence: ${turn.decisionRecord.evidenceReferences.join("; ")}`);
      if (turn.decisionRecord.calculations.length) lines.push(`- Calculations: ${turn.decisionRecord.calculations.join("; ")}`);
      if (turn.decisionRecord.assumptions.length) lines.push(`- Assumptions: ${turn.decisionRecord.assumptions.join("; ")}`);
      if (turn.decisionRecord.alternativesConsidered.length) lines.push(`- Alternatives: ${turn.decisionRecord.alternativesConsidered.join("; ")}`);
      for (const check of turn.decisionRecord.ruleChecks ?? []) lines.push(`- Rule ${check.ruleId} [${check.outcome}]: ${check.rule} — ${check.detail}`);
      lines.push(`- Terms: inspection ${turn.terms.inspection ? "retained" : "waived"}; ${money.format(turn.terms.sellerCredit)} credit; ${turn.terms.closingDays}-day close; ${money.format(turn.terms.earnestMoney)} earnest money`, `- Confidence: ${Math.round(turn.decisionRecord.confidence * 100)}%`, "");
    }
    if (run.termination) lines.push("### Exit audit", "", `- Rule: ${run.termination.ruleId}`, `- Criterion: ${run.termination.criterion}`, `- Observed: ${run.termination.observedValue}`, `- Explanation: ${run.termination.explanation}`, "");
  }
  if (simulation.synthesis) {
    const synthesis = simulation.synthesis;
    lines.push("## Final synthesis", "", synthesis.recommendation, "", synthesis.outcomeSummary, "");
    if (synthesis.buyerProposalStrategy && synthesis.sellerProposalStrategy) {
      lines.push("### Target-success estimates", "", `- Buyer target: ${Math.round(synthesis.buyerTargetProbability)}% — ${synthesis.buyerTargetDefinition}`, `- Seller target: ${Math.round(synthesis.sellerTargetProbability)}% — ${synthesis.sellerTargetDefinition}`, `- Joint agreement: ${Math.round(synthesis.jointAgreementProbability)}%`, "", `Method: ${synthesis.probabilityMethodology}`, "");
      for (const item of synthesis.scenarioProbabilities ?? []) lines.push(`- **${scenarioLabels[item.scenario]}:** buyer ${Math.round(item.buyerTargetProbability)}%; seller ${Math.round(item.sellerTargetProbability)}%; agreement ${Math.round(item.jointAgreementProbability)}% — ${item.explanation}`);
      lines.push("", "### Buyer proposal playbook", "", synthesis.buyerProposalStrategy.headline, "", `- Opening: ${synthesis.buyerProposalStrategy.openingPosition}`, `- Concessions: ${synthesis.buyerProposalStrategy.concessionPlan}`);
      for (const item of synthesis.buyerProposalStrategy.termsToEmphasize) lines.push(`- Emphasize: ${item}`);
      for (const item of synthesis.buyerProposalStrategy.talkingPoints) lines.push(`- Say: ${item}`);
      for (const item of synthesis.buyerProposalStrategy.avoid) lines.push(`- Avoid: ${item}`);
      lines.push("", "### Seller proposal playbook", "", synthesis.sellerProposalStrategy.headline, "", `- Opening: ${synthesis.sellerProposalStrategy.openingPosition}`, `- Concessions: ${synthesis.sellerProposalStrategy.concessionPlan}`);
      for (const item of synthesis.sellerProposalStrategy.termsToEmphasize) lines.push(`- Emphasize: ${item}`);
      for (const item of synthesis.sellerProposalStrategy.talkingPoints) lines.push(`- Say: ${item}`);
      for (const item of synthesis.sellerProposalStrategy.avoid) lines.push(`- Avoid: ${item}`);
      if ((synthesis.proposalEvidence ?? []).length) lines.push("", "### Evidence used in the final recommendation", "", ...synthesis.proposalEvidence.map((item) => `- ${item}`));
      lines.push("");
    }
  }
  lines.push("## Usage", "", `${simulation.usage.totalTokens.toLocaleString()} tokens; ${simulation.usage.webSearchCalls} web searches; ${simulation.usage.modelCalls} model calls; $${simulation.usage.estimatedCostUsd.toFixed(3)} estimated API cost.`);
  return lines.join("\n");
}

function download(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function initialConfig(house: House): SimulationConfig {
  return {
    downPaymentPercent: 10,
    interestRateMin: 6.25,
    interestRateMax: 6.75,
    maximumMonthlyPayment: 0,
    walkAwayPrice: Math.round(house.price * 0.97 / 1000) * 1000,
    closeDealBuffer: 5_000,
    enforceBuyerWalkAway: true,
    enforceBuyerPaymentCap: true,
    pinBuyerAcceptanceToLatestSeller: true,
    enforceSellerAutoReject: true,
    rewriteSellerAcceptanceBelowMinimum: true,
    rewriteSellerRejectionOfAcceptableOffer: true,
    inclination: "medium",
    maxRounds: 4,
    maxTokens: 120_000,
    maxCostUsd: 2,
    propWireText: "",
  };
}

function monthlyEstimate(price: number, config: SimulationConfig) {
  const down = price * config.downPaymentPercent / 100;
  const loan = Math.max(0, price - down);
  const annualRate = (config.interestRateMin + config.interestRateMax) / 2 / 100;
  const rate = annualRate / 12;
  const factor = Math.pow(1 + rate, 360);
  const principalInterest = rate === 0 ? loan / 360 : loan * rate * factor / (factor - 1);
  const taxes = price * 0.0125 / 12;
  const insurance = 200;
  const pmi = config.downPaymentPercent < 20 ? loan * 0.0035 / 12 : 0;
  return Math.round(principalInterest + taxes + insurance + pmi);
}

function NumberField({ label, value, onChange, min, max, step = 1, prefix, suffix, help }: {
  label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; prefix?: string; suffix?: string; help?: string;
}) {
  return <label className="neg-field"><span>{label}</span><div className="neg-number">{prefix&&<i>{prefix}</i>}<input type="number" min={min} max={max} step={step} value={value} onChange={(event)=>onChange(Number(event.target.value))}/>{suffix&&<i>{suffix}</i>}</div>{help&&<small>{help}</small>}</label>;
}

function RuleToggle({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (checked: boolean) => void; help: string }) {
  return <label className="neg-rule-toggle"><input type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)}/><span><b>{label}</b><small>{help}</small></span></label>;
}

export default function NegotiationSimulator({ house, backgroundResearch, onClose }: Props) {
  const [config, setConfig] = useState(() => initialConfig(house));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState("gpt-5.6-terra");
  const [accessKey, setAccessKey] = useState("");
  const [simulation, setSimulation] = useState<NegotiationSimulation | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const estimatedWalkAwayMonthly = useMemo(() => monthlyEstimate(config.walkAwayPrice, config), [config]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/negotiations?health=1", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to check negotiation configuration.");
        return response.json() as Promise<{ configured: boolean; model?: string }>;
      })
      .then((body) => { if (!cancelled) { setConfigured(body.configured); setModel(body.model || "gpt-5.6-terra"); } })
      .catch(()=>{if(!cancelled)setConfigured(false)});
    return () => { cancelled = true; };
  }, [house.id]);

  const patch = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));

  const advanceUntilDone = async (starting: NegotiationSimulation) => {
    let current = starting;
    setWorking(true);
    setError("");
    try {
      for (let step = 0; step < 80 && current.status !== "completed"; step += 1) {
        const response = await fetch("/api/negotiations", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: current.id, accessKey: accessKey.trim() }),
        });
        const body = await response.json() as { simulation?: NegotiationSimulation; error?: string };
        if (!response.ok || !body.simulation) throw new Error(body.error || "The simulation could not continue.");
        current = body.simulation;
        setSimulation(current);
        if (current.status === "paused" || current.status === "failed") throw new Error(current.error || "The simulation paused.");
      }
      if (current.status !== "completed") throw new Error("The simulator stopped after reaching its safety step limit.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The simulation could not continue.");
    } finally { setWorking(false); }
  };

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      const response = await fetch("/api/negotiations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessKey: accessKey.trim(),
          property: {
            houseId: house.id,
            address: qualifiedAddress(house.address),
            listingUrl: house.url,
            listPrice: house.price,
            beds: house.beds,
            baths: house.baths,
            sqft: house.sqft,
            yearBuilt: house.yearBuilt,
            listingStatus: house.listingStatus,
            source: house.source,
            backgroundResearch,
          },
          config,
        }),
      });
      const body = await response.json() as { simulation?: NegotiationSimulation; error?: string; code?: string };
      if (!response.ok || !body.simulation) throw new Error(body.error || "Unable to start the simulation.");
      setSimulation(body.simulation);
      setWorking(false);
      await advanceUntilDone(body.simulation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start the simulation.");
      setWorking(false);
    }
  };

  const loadLatest = async () => {
    setError("");
    setWorking(true);
    try {
      const response = await fetch("/api/negotiations", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "load-latest", houseId: house.id, accessKey: accessKey.trim() }),
      });
      const body = await response.json() as { simulation?: NegotiationSimulation | null; error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to load the saved simulation.");
      if (!body.simulation) throw new Error("No saved simulation exists for this property yet.");
      setSimulation(body.simulation);
      if (body.simulation.status !== "completed") await advanceUntilDone(body.simulation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load the saved simulation.");
    } finally { setWorking(false); }
  };

  const running = simulation && simulation.status !== "completed";
  const completedRuns = simulation?.runs.filter((run)=>run.status === "terminal").length ?? 0;
  const progress = simulation ? Math.min(100, simulation.status === "completed" ? 100 : Math.round((simulation.buyerResearch ? 12 : 2) + (simulation.sellerResearch ? 12 : 0) + completedRuns * 22 + (simulation.runs.reduce((sum, run)=>sum+run.transcript.length,0) * 2))) : 0;

  return <div className="neg-backdrop"><section className="neg-modal" role="dialog" aria-modal="true" aria-labelledby="neg-title">
    <header className="neg-header"><div><p className="eyebrow">THREE-SCENARIO GPT SIMULATION</p><h2 id="neg-title">Negotiate {house.address}</h2><p>{money.format(house.price)} asking · {house.beds} bd · {house.baths} ba · {house.sqft.toLocaleString()} sq ft</p></div><button type="button" onClick={onClose} aria-label="Close negotiation simulator">×</button></header>

    {!simulation&&<form className="neg-setup" onSubmit={start}>
      <div className="neg-overview"><div><span>01</span><strong>Research once</strong><p>Buyer and seller independently research the frozen property evidence.</p></div><div><span>02</span><strong>Run three sellers</strong><p>Motivated, market-aligned and firm thresholds are generated privately.</p></div><div><span>03</span><strong>Compare outcomes</strong><p>Offers, counters, rationale, tokens and cost are preserved.</p></div></div>
      {configured===false&&<div className="neg-api-warning"><strong>OpenAI API setup required</strong><p>Add <code>OPENAI_API_KEY</code> as a secret runtime variable before starting a paid GPT run.</p></div>}
      <div className="neg-form-grid"><fieldset><legend>Buyer’s private limits</legend><div className="neg-fields">
        <NumberField label="Down payment" value={config.downPaymentPercent} onChange={(value)=>patch("downPaymentPercent",value)} min={0} max={100} suffix="%"/>
        <NumberField label="Walk-away target" value={config.walkAwayPrice} onChange={(value)=>patch("walkAwayPrice",value)} min={Math.round(house.price*.5)} max={Math.round(house.price*1.5)} step={1000} prefix="$" help={`Ordinary ceiling · about ${money.format(estimatedWalkAwayMonthly)}/month at the midpoint rate`}/>
        <NumberField label="Close-deal buffer" value={config.closeDealBuffer??5000} onChange={(value)=>patch("closeDealBuffer",value)} min={0} max={15000} step={500} prefix="$" help={`Used only for a small final gap; absolute ceiling ${money.format(config.walkAwayPrice+(config.closeDealBuffer??5000))}`}/>
        <NumberField label="Minimum interest" value={config.interestRateMin} onChange={(value)=>patch("interestRateMin",value)} min={0} max={20} step={.01} suffix="%"/>
        <NumberField label="Maximum interest" value={config.interestRateMax} onChange={(value)=>patch("interestRateMax",value)} min={0} max={20} step={.01} suffix="%"/>
        <NumberField label="Maximum monthly payment" value={config.maximumMonthlyPayment} onChange={(value)=>patch("maximumMonthlyPayment",value)} min={0} max={25000} step={50} prefix="$" help="Enter 0 to leave uncapped"/>
        <label className="neg-field"><span>Inclination to buy</span><select value={config.inclination} onChange={(event)=>patch("inclination",event.target.value as Inclination)}><option value="low">Low · willing to lose</option><option value="medium">Medium · balanced</option><option value="high">High · protect acquisition</option><option value="must-have">Must-have · optimize terms</option></select></label>
      </div></fieldset><fieldset><legend>Run controls</legend><div className="neg-fields">
        <NumberField label="Rounds per scenario" value={config.maxRounds} onChange={(value)=>patch("maxRounds",value)} min={1} max={8}/>
        <NumberField label="Token budget" value={config.maxTokens} onChange={(value)=>patch("maxTokens",value)} min={20000} max={400000} step={10000}/>
        <NumberField label="Cost ceiling" value={config.maxCostUsd} onChange={(value)=>patch("maxCostUsd",value)} min={.25} max={15} step={.25} prefix="$" help="Hard stop across all three runs"/>
        <div className="neg-model"><span>Model</span><strong>{model}</strong><small>Balanced reasoning and cost</small></div>
        <label className="neg-field"><span>Access passphrase</span><input type="password" autoComplete="current-password" value={accessKey} onChange={(event)=>setAccessKey(event.target.value)} minLength={8} maxLength={128} placeholder="Temporary test passphrase"/><small>Temporary hardcoded comparison for authentication testing</small></label>
      </div><label className="neg-propwire"><span>Paste raw PropWire property data</span><textarea value={config.propWireText} onChange={(event)=>patch("propWireText",event.target.value)} maxLength={24000} placeholder="Paste ownership, mortgage, transaction, valuation and comparable-sale text here…"/><small>{config.propWireText.length.toLocaleString()} / 24,000 characters</small></label></fieldset></div>
      <section className="neg-enforcement"><div className="neg-section-title"><p className="eyebrow">DETERMINISTIC ENFORCEMENT</p><h3>Choose which model actions code may override</h3></div><div className="neg-enforcement-grid"><fieldset><legend>Buyer rules</legend><RuleToggle label="Enforce walk-away target" checked={config.enforceBuyerWalkAway!==false} onChange={(value)=>patch("enforceBuyerWalkAway",value)} help="Block offers and acceptances above the target plus close-deal buffer."/><RuleToggle label="Enforce monthly-payment cap" checked={config.enforceBuyerPaymentCap!==false} onChange={(value)=>patch("enforceBuyerPaymentCap",value)} help="Force walk-away when the estimated monthly payment exceeds the cap."/><RuleToggle label="Pin acceptance to latest counter" checked={config.pinBuyerAcceptanceToLatestSeller!==false} onChange={(value)=>patch("pinBuyerAcceptanceToLatestSeller",value)} help="Prevent acceptance of a stale or invented seller price."/></fieldset><fieldset><legend>Seller rules</legend><RuleToggle label="Enforce automatic-reject floor" checked={config.enforceSellerAutoReject!==false} onChange={(value)=>patch("enforceSellerAutoReject",value)} help="Force rejection when the buyer is below the scenario floor."/><RuleToggle label="Rewrite acceptance below minimum" checked={config.rewriteSellerAcceptanceBelowMinimum!==false} onChange={(value)=>patch("rewriteSellerAcceptanceBelowMinimum",value)} help="Replace an invalid seller acceptance with a counter at its minimum."/><RuleToggle label="Keep acceptable offers negotiating" checked={config.rewriteSellerRejectionOfAcceptableOffer!==false} onChange={(value)=>patch("rewriteSellerRejectionOfAcceptableOffer",value)} help="Replace rejection of an acceptable offer with a counter."/></fieldset></div></section>
      <section className="neg-rulebook"><div className="neg-section-title"><p className="eyebrow">RULES SHOWN BEFORE THE RUN</p><h3>Decision rules and exact exit criteria</h3></div><p className="neg-rule-intro">Every action is checked against these named rules. Scenario-specific seller dollar thresholds are generated privately after research and are revealed in the final audit.</p><div className="neg-rule-table" role="table"><div className="head" role="row"><span>Rule</span><span>Trigger</span><span>Result</span></div>{rulebook(config).map((item)=><div role="row" key={item.id}><strong>{item.id}<small>{item.owner} · {item.rule}</small></strong><span>{item.trigger}</span><span>{item.result}</span></div>)}</div></section>
      <div className="neg-privacy"><strong>Private by construction</strong><p>The Buyer never receives seller thresholds. The Seller never receives your walk-away price, inclination, rate or payment cap. Only public offers and terms cross between them.</p></div>
      {error&&<p className="neg-error" role="alert">{error}</p>}
      <div className="neg-setup-actions"><button className="neg-load" type="button" onClick={()=>void loadLatest()} disabled={working||configured!==true||accessKey.length<8}>Resume saved run</button><button className="neg-start" type="submit" disabled={working||configured!==true||accessKey.length<8}>{working?"Starting…":"Run three simulations"}</button></div>
    </form>}

    {simulation&&<div className="neg-results">
      <div className="neg-runbar"><div><span className={working?"pulse":""}/><div><strong>{simulation.stepLabel}</strong><p>{simulation.status === "completed" ? "All scenario results are saved." : working ? "Keep this window open for live progress. You can resume later if interrupted." : "The run is paused and can be resumed."}</p></div></div><div className="neg-usage"><span>{simulation.usage.totalTokens.toLocaleString()} tokens</span><span>{simulation.usage.webSearchCalls} searches</span><strong>${simulation.usage.estimatedCostUsd.toFixed(3)}</strong></div></div>
      <div className="neg-progress" aria-label={`${progress}% complete`}><i style={{width:`${progress}%`}}/></div>
      {error&&<p className="neg-error" role="alert">{error}</p>}
      {running&&!working&&<button type="button" className="neg-resume" onClick={()=>void advanceUntilDone(simulation)}>Resume simulation</button>}

      {(simulation.buyerResearch||simulation.sellerResearch)&&<section className="neg-dossier"><div className="neg-section-title"><p className="eyebrow">FROZEN EVIDENCE DOSSIER</p><h3>Independent research, completed once</h3></div>{simulation.config.propWireText.trim()&&<p className="neg-rule-intro">Curated PropWire input was supplied ({simulation.config.propWireText.length.toLocaleString()} characters). Each agent must reconcile it with web research before setting its valuation.</p>}<div className="neg-research-grid">{[simulation.buyerResearch,simulation.sellerResearch].filter(Boolean).map((report)=><article key={report!.agent}><span>{report!.agent.toUpperCase()} RESEARCH</span><strong>{money.format(report!.fairValueLow)}–{money.format(report!.fairValueHigh)}</strong><p>{report!.summary}</p><details open><summary>Curated PropWire evidence</summary><p>{report!.propWireAssessment??"Legacy run — no separate PropWire assessment was recorded."}</p>{(report!.suppliedEvidence??[]).length?<ul>{(report!.suppliedEvidence??[]).map((fact)=><li key={fact.id}><b>{fact.id} · {fact.disposition} · {fact.priceSignal}</b><br/>{fact.fact}<br/><small>{fact.calculation} · {fact.rationale}</small></li>)}</ul>:<p>No structured PropWire facts were recorded for this run.</p>}</details><details><summary>Web evidence and sources</summary><h4>Market signals</h4><ul>{report!.marketSignals.map((item)=><li key={item}>{item}</li>)}</ul><h4>Risks</h4><ul>{report!.risks.map((item)=><li key={item}>{item}</li>)}</ul>{report!.sources.map((source)=><a key={`${source.url}-${source.title}`} href={source.url} target="_blank" rel="noreferrer"><b>{source.title}</b><small>{source.claim}</small></a>)}</details></article>)}</div></section>}

      {simulation.runs.length>0&&<section className="neg-scenarios"><div className="neg-section-title"><p className="eyebrow">AGENT-TO-AGENT CONVERSATIONS</p><h3>Every offer, response and justification</h3></div><div className="neg-scenario-grid">{simulation.runs.map((run)=><article className={`neg-scenario ${run.status}`} key={run.scenario}>
        <header><div><span>{scenarioLabels[run.scenario]}</span><strong>{run.outcome?outcomeLabels[run.outcome]:run.status==="running"?`Round ${run.round}`:"Waiting"}</strong></div>{run.finalPrice&&<b>{money.format(run.finalPrice)}</b>}</header>
        {run.profile&&<div className="neg-thresholds"><span><small>Auto-reject below</small>{money.format(run.profile.automaticRejectBelow)}</span><span><small>Negotiate from</small>{money.format(run.profile.negotiationThreshold)}</span><span><small>Minimum acceptable</small>{money.format(run.profile.minimumAcceptablePrice)}</span><span><small>Preferred</small>{money.format(run.profile.preferredPrice)}</span><p>{run.profile.generationNote}</p></div>}
        <div className="neg-conversation">{run.transcript.length===0?<p className="neg-waiting">No messages yet.</p>:run.transcript.map((turn,index)=><article className={`neg-turn ${turn.actor}`} key={`${turn.actor}-${turn.round}-${index}`}>
          <div className="neg-bubble"><header><span>{turn.actor} agent</span><b>Round {turn.round} · {turn.action.replaceAll("_"," ")}</b><strong>{turn.price?money.format(turn.price):"No price"}</strong></header><p>{turn.publicMessage}</p></div>
          <details className="neg-audit" open><summary>Why this action · complete audit detail</summary><div>
            <section><h4>What happened and why</h4><p>{turnJustification(simulation,run,turn,index)}</p></section>
            <section><h4>Rule checks</h4>{(turn.decisionRecord.ruleChecks??[]).length?<ul className="neg-checks">{(turn.decisionRecord.ruleChecks??[]).map((check,checkIndex)=><li className={check.outcome.toLowerCase()} key={`${check.ruleId}-${checkIndex}`}><b>{check.ruleId} · {check.outcome}</b><span>{check.rule}</span><small>{check.detail}</small></li>)}</ul>:<p>Legacy saved turn: no structured rule checks were recorded.</p>}</section>
            <div className="neg-audit-grid"><section><h4>Evidence referenced</h4><ul>{turn.decisionRecord.evidenceReferences.length?turn.decisionRecord.evidenceReferences.map((item)=><li key={item}>{item}</li>):<li>None recorded</li>}</ul></section><section><h4>Calculations</h4><ul>{turn.decisionRecord.calculations.length?turn.decisionRecord.calculations.map((item)=><li key={item}>{item}</li>):<li>None required</li>}</ul></section><section><h4>Assumptions</h4><ul>{turn.decisionRecord.assumptions.length?turn.decisionRecord.assumptions.map((item)=><li key={item}>{item}</li>):<li>None recorded</li>}</ul></section><section><h4>Alternatives considered</h4><ul>{turn.decisionRecord.alternativesConsidered.length?turn.decisionRecord.alternativesConsidered.map((item)=><li key={item}>{item}</li>):<li>None recorded</li>}</ul></section></div>
            <section className="neg-term-audit"><h4>Offer terms and confidence</h4><p>{turn.terms.inspection?"Inspection retained":"Inspection waived"} · {money.format(turn.terms.earnestMoney)} earnest money · {turn.terms.closingDays}-day close · {money.format(turn.terms.sellerCredit)} seller credit · {Math.round(turn.decisionRecord.confidence*100)}% confidence</p></section>
          </div></details>
        </article>)}</div>
        {run.termination&&<div className="neg-exit"><strong>Exit audit · {run.termination.ruleId}</strong><p>{run.termination.criterion}</p><dl><dt>Observed</dt><dd>{run.termination.observedValue}</dd><dt>Why it ended</dt><dd>{run.termination.explanation}</dd></dl></div>}
      </article>)}</div></section>}

      {simulation.synthesis&&<section className="neg-synthesis"><div className="neg-section-title"><p className="eyebrow">DECISION SYNTHESIS</p><h3>What the three runs suggest</h3></div><div className="neg-price-band"><span><small>Defensible opening</small>{money.format(simulation.synthesis.defensibleOpeningOffer)}</span><span><small>Likely settlement</small>{money.format(simulation.synthesis.likelySettlementLow)}–{money.format(simulation.synthesis.likelySettlementHigh)}</span><span><small>Recommended maximum</small>{money.format(simulation.synthesis.recommendedMaximum)}</span></div><div className="neg-synthesis-copy"><strong>{simulation.synthesis.recommendation}</strong><p>{simulation.synthesis.outcomeSummary}</p><div><ul>{simulation.synthesis.keyDrivers.map((item)=><li key={item}>{item}</li>)}</ul><ul>{simulation.synthesis.uncertainties.map((item)=><li key={item}>{item}</li>)}</ul></div></div>
      {simulation.synthesis.buyerProposalStrategy&&simulation.synthesis.sellerProposalStrategy&&<><div className="neg-targets"><article><span>BUYER TARGET</span><strong>{Math.round(simulation.synthesis.buyerTargetProbability)}%</strong><p>{simulation.synthesis.buyerTargetDefinition}</p></article><article><span>SELLER TARGET</span><strong>{Math.round(simulation.synthesis.sellerTargetProbability)}%</strong><p>{simulation.synthesis.sellerTargetDefinition}</p></article><article><span>JOINT AGREEMENT</span><strong>{Math.round(simulation.synthesis.jointAgreementProbability)}%</strong><p>Estimated chance that both sides can satisfy their defined objectives in the simulated scenario mix.</p></article></div>
      <div className="neg-probability-note"><strong>How these estimates were formed</strong><p>{simulation.synthesis.probabilityMethodology}</p></div>
      <div className="neg-scenario-probabilities"><div className="head"><span>Seller scenario</span><span>Buyer target</span><span>Seller target</span><span>Agreement</span><span>Why</span></div>{(simulation.synthesis.scenarioProbabilities??[]).map((item)=><div key={item.scenario}><strong>{scenarioLabels[item.scenario]}</strong><span>{Math.round(item.buyerTargetProbability)}%</span><span>{Math.round(item.sellerTargetProbability)}%</span><span>{Math.round(item.jointAgreementProbability)}%</span><p>{item.explanation}</p></div>)}</div>
      <div className="neg-playbooks"><article><span>BUYER PROPOSAL PLAYBOOK</span><h4>{simulation.synthesis.buyerProposalStrategy.headline}</h4><dl><dt>Opening position</dt><dd>{simulation.synthesis.buyerProposalStrategy.openingPosition}</dd><dt>Concession plan</dt><dd>{simulation.synthesis.buyerProposalStrategy.concessionPlan}</dd></dl><div><section><h5>Terms to emphasize</h5><ul>{simulation.synthesis.buyerProposalStrategy.termsToEmphasize.map((item)=><li key={item}>{item}</li>)}</ul></section><section><h5>Talking points</h5><ul>{simulation.synthesis.buyerProposalStrategy.talkingPoints.map((item)=><li key={item}>{item}</li>)}</ul></section><section><h5>Avoid</h5><ul>{simulation.synthesis.buyerProposalStrategy.avoid.map((item)=><li key={item}>{item}</li>)}</ul></section></div></article><article><span>SELLER PROPOSAL PLAYBOOK</span><h4>{simulation.synthesis.sellerProposalStrategy.headline}</h4><dl><dt>Opening position</dt><dd>{simulation.synthesis.sellerProposalStrategy.openingPosition}</dd><dt>Concession plan</dt><dd>{simulation.synthesis.sellerProposalStrategy.concessionPlan}</dd></dl><div><section><h5>Terms to emphasize</h5><ul>{simulation.synthesis.sellerProposalStrategy.termsToEmphasize.map((item)=><li key={item}>{item}</li>)}</ul></section><section><h5>Talking points</h5><ul>{simulation.synthesis.sellerProposalStrategy.talkingPoints.map((item)=><li key={item}>{item}</li>)}</ul></section><section><h5>Avoid</h5><ul>{simulation.synthesis.sellerProposalStrategy.avoid.map((item)=><li key={item}>{item}</li>)}</ul></section></div></article></div>
      {(simulation.synthesis.proposalEvidence??[]).length>0&&<details className="neg-proposal-evidence"><summary>Evidence used in the final recommendation</summary><ul>{simulation.synthesis.proposalEvidence.map((item)=><li key={item}>{item}</li>)}</ul></details>}</>}
      <p className="neg-disclaimer">These probabilities are scenario estimates, not measured odds or knowledge of the actual seller. Verify comps, financing, inspection and offer terms with qualified professionals.</p></section>}

      {simulation.status==="completed"&&<section className="neg-final-audit"><div className="neg-section-title"><p className="eyebrow">FINAL RULE AND EXIT AUDIT</p><h3>What governed each outcome</h3></div><div className="neg-rule-table"><div className="head"><span>Scenario / outcome</span><span>Exit criterion</span><span>Observed result</span></div>{simulation.runs.map((run)=><div key={run.scenario}><strong>{scenarioLabels[run.scenario]}<small>{run.outcome?outcomeLabels[run.outcome]:run.status}</small></strong><span>{run.termination?`${run.termination.ruleId} · ${run.termination.criterion}`:"Legacy run — exit detail unavailable"}</span><span>{run.termination?.observedValue??(run.finalPrice?money.format(run.finalPrice):"No final price")}</span></div>)}</div><details open><summary>Complete rulebook used by this simulation</summary><div className="neg-rule-table">{rulebook(simulation.config).map((item)=><div key={item.id}><strong>{item.id}<small>{item.owner} · {item.rule}</small></strong><span>{item.trigger}</span><span>{item.result}</span></div>)}</div></details></section>}

      {simulation.status==="completed"&&<div className="neg-finish"><div className="neg-downloads"><button type="button" onClick={()=>download(`negotiation-${house.id}.md`,reportMarkdown(simulation),"text/markdown;charset=utf-8")}>Download detailed report</button><button type="button" onClick={()=>download(`negotiation-${house.id}.json`,JSON.stringify({rulebook:rulebook(simulation.config),simulation},null,2),"application/json")}>Download full JSON</button></div><button type="button" onClick={()=>setSimulation(null)}>Run with different assumptions</button><button type="button" onClick={onClose}>Done</button></div>}
    </div>}
  </section></div>;
}
