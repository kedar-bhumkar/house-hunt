export type Inclination = "low" | "medium" | "high" | "must-have";
export type ScenarioName = "motivated" | "market-aligned" | "firm";
export type RunOutcome =
  | "AGREEMENT_REACHED"
  | "SELLER_REJECTED"
  | "BUYER_WALKED_AWAY"
  | "STALEMATE"
  | "ROUND_LIMIT_REACHED"
  | "TOKEN_BUDGET_EXHAUSTED"
  | "COST_BUDGET_EXHAUSTED";

export type EvidenceSource = {
  title: string;
  url: string;
  claim: string;
};

export type SuppliedEvidenceFact = {
  id: string;
  category: "COMPARABLE_SALE" | "VALUATION" | "PROPERTY_ATTRIBUTE" | "PROPERTY_HISTORY" | "OWNERSHIP_FINANCING" | "OTHER";
  fact: string;
  disposition: "USED" | "EXCLUDED" | "CONFLICT";
  priceSignal: "LOWER" | "NEUTRAL" | "HIGHER";
  calculation: string;
  rationale: string;
};

export type ResearchReport = {
  agent: "buyer" | "seller";
  summary: string;
  fairValueLow: number;
  fairValueMid: number;
  fairValueHigh: number;
  marketSignals: string[];
  risks: string[];
  leverage: string[];
  assumptions: string[];
  propWireAssessment: string;
  suppliedEvidence: SuppliedEvidenceFact[];
  sources: EvidenceSource[];
};

export type DecisionRecord = {
  summary: string;
  evidenceReferences: string[];
  calculations: string[];
  assumptions: string[];
  alternativesConsidered: string[];
  ruleChecks: RuleCheck[];
  confidence: number;
};

export type RuleCheck = {
  ruleId: string;
  rule: string;
  outcome: "PASS" | "TRIGGERED" | "NOT_APPLICABLE";
  detail: string;
};

export type TerminationRecord = {
  ruleId: string;
  criterion: string;
  observedValue: string;
  explanation: string;
};

export type NegotiationTerms = {
  inspection: boolean;
  sellerCredit: number;
  closingDays: number;
  earnestMoney: number;
};

export type NegotiationAction = {
  actor: "buyer" | "seller";
  action: "OFFER" | "COUNTER" | "ACCEPT" | "REJECT" | "WALK_AWAY";
  price: number | null;
  publicMessage: string;
  decisionRecord: DecisionRecord;
  terms: NegotiationTerms;
  createdAt: string;
  round: number;
};

export type SellerProfile = {
  scenario: ScenarioName;
  automaticRejectBelow: number;
  negotiationThreshold: number;
  minimumAcceptablePrice: number;
  preferredPrice: number;
  concessionBudget: number;
  motivation: number;
  competitionStrength: number;
  generationNote: string;
};

export type ScenarioRun = {
  scenario: ScenarioName;
  profile?: SellerProfile;
  status: "pending" | "running" | "terminal";
  outcome: RunOutcome | null;
  round: number;
  nextActor: "buyer" | "seller";
  transcript: NegotiationAction[];
  finalPrice: number | null;
  termination?: TerminationRecord | null;
};

export type SimulationUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  webSearchCalls: number;
  estimatedCostUsd: number;
  modelCalls: number;
};

export type SimulationConfig = {
  downPaymentPercent: number;
  interestRateMin: number;
  interestRateMax: number;
  maximumMonthlyPayment: number;
  walkAwayPrice: number;
  closeDealBuffer: number;
  enforceBuyerWalkAway: boolean;
  enforceBuyerPaymentCap: boolean;
  pinBuyerAcceptanceToLatestSeller: boolean;
  enforceSellerAutoReject: boolean;
  rewriteSellerAcceptanceBelowMinimum: boolean;
  rewriteSellerRejectionOfAcceptableOffer: boolean;
  inclination: Inclination;
  maxRounds: number;
  maxTokens: number;
  maxCostUsd: number;
  propWireText: string;
};

export type SimulationProperty = {
  houseId: string;
  address: string;
  listingUrl: string;
  listPrice: number;
  beds: number;
  baths: number;
  sqft: number;
  yearBuilt: number | null;
  listingStatus: string;
  source: string;
  backgroundResearch: string;
};

export type SimulationSynthesis = {
  defensibleOpeningOffer: number;
  likelySettlementLow: number;
  likelySettlementHigh: number;
  recommendedMaximum: number;
  recommendation: string;
  outcomeSummary: string;
  keyDrivers: string[];
  uncertainties: string[];
  buyerTargetDefinition: string;
  sellerTargetDefinition: string;
  buyerTargetProbability: number;
  sellerTargetProbability: number;
  jointAgreementProbability: number;
  probabilityMethodology: string;
  proposalEvidence: string[];
  buyerProposalStrategy: ProposalStrategy;
  sellerProposalStrategy: ProposalStrategy;
  scenarioProbabilities: ScenarioProbability[];
};

export type ProposalStrategy = {
  headline: string;
  openingPosition: string;
  concessionPlan: string;
  termsToEmphasize: string[];
  talkingPoints: string[];
  avoid: string[];
};

export type ScenarioProbability = {
  scenario: ScenarioName;
  buyerTargetProbability: number;
  sellerTargetProbability: number;
  jointAgreementProbability: number;
  explanation: string;
};

export type NegotiationSimulation = {
  id: string;
  status: "running" | "completed" | "paused" | "failed";
  phase: "buyer-research" | "seller-research" | "scenario-generation" | "negotiation" | "synthesis" | "complete";
  stepLabel: string;
  property: SimulationProperty;
  config: SimulationConfig;
  buyerResearch: ResearchReport | null;
  sellerResearch: ResearchReport | null;
  runs: ScenarioRun[];
  synthesis: SimulationSynthesis | null;
  usage: SimulationUsage;
  error: string;
  createdAt: string;
  updatedAt: string;
};
