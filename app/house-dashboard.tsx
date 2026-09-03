"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { House } from "./page";
import { publishedResearch } from "./research-results";
import NegotiationSimulator from "./negotiation-simulator";

type Decision = { interest: string; action: string; notes: string };
type Decisions = Record<string, Decision>;
type ResearchRecord = { houseId: string; address: string; status: "requested" | "complete" | "not-found"; summary: string; sourcesChecked: string; checkedAt: string; updatedAt: string };
type ResearchRecords = Record<string, ResearchRecord>;
type RebuildState = { status: "idle" | "requested" | "complete"; requestedAt: string; completedAt: string };
type FilterGroup = "price" | "status" | "listing" | "decision";
type FilterOption = { label: string; group: FilterGroup };
type ViewMode = "tabular" | "grid" | "graph";
type Coordinate = { lat: number; lng: number };
type Coordinates = Record<string, Coordinate | null>;
const blank = (): Decision => ({ interest: "Undecided", action: "None", notes: "" });
const storageKey = "kedar-house-decisions";
const compareStorageKey = "kedar-house-compare-v1";
const migrationKey = "house-decisions-cloud-migration-v1";
const outboxKey = "kedar-house-decisions-outbox-v1";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const loanModel = { downPercent: .10, annualRate: .0649, months: 360, basePrice: 500000, baseTaxesInsurance: 630.83 };
const estimatePayment = (price: number) => {
  const down = price * loanModel.downPercent;
  const loan = price - down;
  const monthlyRate = loanModel.annualRate / 12;
  const factor = Math.pow(1 + monthlyRate, loanModel.months);
  const principalInterest = loan * monthlyRate * factor / (factor - 1);
  const taxesInsurance = loanModel.baseTaxesInsurance * (price / loanModel.basePrice);
  return { down, loan, principalInterest, taxesInsurance, total: principalInterest + taxesInsurance };
};

function EmiCalculator({ house }: { house: House }) {
  const [rate, setRate] = useState(6.49);
  const [downPercent, setDownPercent] = useState(10);
  const [termYears, setTermYears] = useState(30);
  const [hoa, setHoa] = useState(0);
  const price = house.price;
  const down = price * Math.max(0, Math.min(100, downPercent)) / 100;
  const loan = Math.max(0, price - down);
  const months = Math.max(1, termYears * 12);
  const monthlyRate = Math.max(0, rate) / 100 / 12;
  const factor = Math.pow(1 + monthlyRate, months);
  const principalInterest = monthlyRate === 0 ? loan / months : loan * monthlyRate * factor / (factor - 1);
  const taxesInsurance = loanModel.baseTaxesInsurance * (price / loanModel.basePrice);
  const pmi = downPercent < 20 ? loan * .005 / 12 : 0;
  const total = principalInterest + taxesInsurance + pmi + Math.max(0, hoa);
  return <details className="emi-calculator"><summary>EMI calculator</summary><div className="emi-body">
    <div className="emi-price"><span>Current house price</span><strong>{money.format(price)}</strong></div>
    <div className="emi-inputs">
      <label>Interest rate<input type="number" min="0" max="20" step="0.01" value={rate} onChange={(event)=>setRate(Number(event.target.value))}/><small>% APR</small></label>
      <label>Down payment<input type="number" min="0" max="100" step="1" value={downPercent} onChange={(event)=>setDownPercent(Number(event.target.value))}/><small>% · {money.format(down)}</small></label>
      <label>Loan term<select value={termYears} onChange={(event)=>setTermYears(Number(event.target.value))}><option value={15}>15 years</option><option value={20}>20 years</option><option value={30}>30 years</option></select></label>
      <label>HOA / month<input type="number" min="0" step="25" value={hoa} onChange={(event)=>setHoa(Number(event.target.value))}/><small>$ · defaults to 0</small></label>
    </div>
    <div className="emi-results"><div><span>Principal &amp; interest</span><b>{money.format(principalInterest)}</b></div><div><span>Est. taxes &amp; insurance</span><b>{money.format(taxesInsurance)}</b></div><div><span>Est. PMI</span><b>{pmi ? money.format(pmi) : "$0"}</b></div><div><span>Estimated total / month</span><strong>{money.format(total)}</strong></div></div>
    <p>Planning estimate only. Taxes and insurance use the model allowance scaled to this price. PMI assumes 0.50% annually when down payment is below 20%; HOA is user-entered.</p>
  </div></details>;
}

const boundary = [[-93.515,44.885],[-93.495,44.907],[-93.435,44.902],[-93.391,44.875],[-93.383,44.824],[-93.421,44.792],[-93.476,44.789],[-93.518,44.817],[-93.528,44.855]];
const amenities = [
  { name:"Eden Prairie Center", kind:"Shopping", lat:44.854, lng:-93.423 }, { name:"Costco", kind:"Grocery", lat:44.879, lng:-93.421 },
  { name:"Jerry's Foods", kind:"Grocery", lat:44.869, lng:-93.447 }, { name:"Purgatory Creek Park", kind:"Park", lat:44.858, lng:-93.463 },
  { name:"Round Lake Park", kind:"Park", lat:44.855, lng:-93.486 }, { name:"Bryant Lake Park", kind:"Park", lat:44.879, lng:-93.407 },
  { name:"Staring Lake", kind:"Lake", lat:44.824, lng:-93.457 }, { name:"Lake Riley", kind:"Lake", lat:44.802, lng:-93.474 },
  { name:"Eden Prairie High", kind:"School", lat:44.842, lng:-93.488 }, { name:"Central Middle", kind:"School", lat:44.858, lng:-93.453 },
  { name:"Community Center", kind:"Sports", lat:44.862, lng:-93.489 }, { name:"Life Time", kind:"Sports", lat:44.864, lng:-93.411 },
];
const tileSize = 256;
const project = (lng: number, lat: number, zoom: number) => {
  const scale = tileSize * Math.pow(2, zoom);
  const sin = Math.sin(lat * Math.PI / 180);
  return { x: (lng + 180) / 360 * scale, y: (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
};
const unproject = (x: number, y: number, zoom: number) => {
  const scale = tileSize * Math.pow(2, zoom);
  const lng = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / scale;
  return { lng, lat: 180 / Math.PI * Math.atan(.5 * (Math.exp(n) - Math.exp(-n))) };
};

function MapView({ houses }: { houses: House[] }) {
  const [coordinates, setCoordinates] = useState<Coordinates>({});
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(13);
  const [center, setCenter] = useState({ lat:44.85, lng:-93.455 });
  const [size, setSize] = useState({ width:900, height:620 });
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{x:number;y:number;centerX:number;centerY:number}|null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = "kedar-house-map-coordinates-v1";
    let cached: Coordinates = {};
    try { cached = JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { cached = {}; }
    setCoordinates(cached);
    const missing = houses.filter((house)=>!(house.address in cached)).map((house)=>house.address);
    if (missing.length===0) { setLoading(false); return; }
    fetch("/api/geocode", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({addresses:missing}) })
      .then((response)=>response.json() as Promise<{coordinates:Coordinates}>).then(({coordinates:found})=>{
        if(cancelled)return; const merged={...cached,...found}; setCoordinates(merged); localStorage.setItem(key,JSON.stringify(merged));
      }).catch(()=>undefined).finally(()=>{if(!cancelled)setLoading(false)});
    return()=>{cancelled=true};
  }, [houses]);
  useEffect(()=>{
    if(!mapRef.current)return;
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(mapRef.current); return()=>observer.disconnect();
  },[]);
  const selected = houses.find((house)=>house.id===selectedId);
  const pointCount = houses.filter((house)=>coordinates[house.address]).length;
  const centerPx=project(center.lng,center.lat,zoom);
  const topLeft={x:centerPx.x-size.width/2,y:centerPx.y-size.height/2};
  const position=(lng:number,lat:number)=>{const p=project(lng,lat,zoom);return{x:p.x-topLeft.x,y:p.y-topLeft.y}};
  const minTileX=Math.floor(topLeft.x/tileSize), maxTileX=Math.floor((topLeft.x+size.width)/tileSize);
  const minTileY=Math.floor(topLeft.y/tileSize), maxTileY=Math.floor((topLeft.y+size.height)/tileSize);
  const tiles=[] as Array<{x:number;y:number;key:string}>;
  const limit=Math.pow(2,zoom);
  for(let x=minTileX;x<=maxTileX;x++)for(let y=minTileY;y<=maxTileY;y++)if(y>=0&&y<limit)tiles.push({x,y,key:`${zoom}-${x}-${y}`});
  const polygon = boundary.map(([lng,lat])=>{const p=position(lng,lat);return `${p.x},${p.y}`}).join(" ");
  const changeZoom=(next:number)=>setZoom(Math.max(11,Math.min(17,next)));
  const resetMap=()=>{setCenter({lat:44.85,lng:-93.455});setZoom(13)};
  return <div className="map-layout"><div className="area-map">
    <div className="map-toolbar"><div><strong>Eden Prairie terrain map</strong><span>{loading?"Locating homes…":`${pointCount} of ${houses.length} exact-address markers located`}</span></div><div className="map-legend"><span className="legend-house">Price pin</span><span className="legend-amenity">Amenity</span></div></div>
    <div ref={mapRef} className={`terrain-map ${dragRef.current?"dragging":""}`} role="application" aria-label="Interactive terrain map of matching houses and nearby Eden Prairie amenities"
      onWheel={(event)=>{event.preventDefault();changeZoom(zoom+(event.deltaY<0?1:-1))}}
      onPointerDown={(event)=>{if((event.target as HTMLElement).closest("button"))return;const p=project(center.lng,center.lat,zoom);dragRef.current={x:event.clientX,y:event.clientY,centerX:p.x,centerY:p.y};event.currentTarget.setPointerCapture(event.pointerId)}}
      onPointerMove={(event)=>{const d=dragRef.current;if(!d)return;const next=unproject(d.centerX-(event.clientX-d.x),d.centerY-(event.clientY-d.y),zoom);setCenter(next)}}
      onPointerUp={(event)=>{dragRef.current=null;event.currentTarget.releasePointerCapture(event.pointerId)}}>
      <div className="terrain-tiles">{tiles.map((tile)=><img key={tile.key} src={`https://tile.opentopomap.org/${zoom}/${((tile.x%limit)+limit)%limit}/${tile.y}.png`} alt="" draggable={false} style={{left:tile.x*tileSize-topLeft.x,top:tile.y*tileSize-topLeft.y}}/>)}</div>
      <svg className="map-overlay" width={size.width} height={size.height} aria-hidden="true"><polygon points={polygon}/></svg>
      <div className="boundary-label">EDEN PRAIRIE</div>
      {amenities.map((item)=>{const p=position(item.lng,item.lat);return <div key={item.name} className={`amenity-pin ${item.kind.toLowerCase()}`} style={{left:p.x,top:p.y}} title={`${item.kind}: ${item.name}`}><i/><span>{item.name}</span></div>})}
      {houses.map((house)=>{const c=coordinates[house.address];if(!c)return null;const p=position(c.lng,c.lat);const active=house.id===selected?.id;return <button type="button" key={house.id} className={`price-pin ${active?"selected":""}`} style={{left:p.x,top:p.y}} onClick={(event)=>{event.stopPropagation();setSelectedId(house.id)}} aria-label={`Show ${house.address}, ${money.format(house.price)}`}><span>{active?`${house.address} · ${money.format(house.price)}`:money.format(house.price).replace(",000","K").replace("$0K","$0")}</span></button>})}
      <div className="zoom-controls"><button type="button" onClick={(event)=>{event.stopPropagation();changeZoom(zoom+1)}} disabled={zoom>=17} aria-label="Zoom in">+</button><button type="button" onClick={(event)=>{event.stopPropagation();changeZoom(zoom-1)}} disabled={zoom<=11} aria-label="Zoom out">−</button><button type="button" className="reset" onClick={(event)=>{event.stopPropagation();resetMap()}}>Reset</button></div>
      <div className="terrain-badge"><b>Terrain</b><span>Topo + parks + water</span></div>
      <div className="map-attribution">Map data © OpenStreetMap contributors · Tiles © OpenTopoMap</div>
    </div>
    <p className="map-note">Drag to pan, scroll or use +/− to zoom. Price pins use exact-address Census geocoding when available; the highlighted municipal boundary and amenity labels are orientation aids.</p>
  </div><aside className={`map-sidebar ${selected?"open":"empty"}`}>{selected?<><button type="button" className="sidebar-close" onClick={()=>setSelectedId("")} aria-label="Close selected property">×</button><div className={`map-sidebar-photo ${selected.image?"":"missing"}`}>{selected.image?<img src={selected.image} alt={`Front exterior of ${selected.address}`} referrerPolicy="no-referrer"/>:<span>Facade unavailable</span>}</div><p className="eyebrow">SELECTED HOUSE</p><h3>{selected.address}</h3><strong>{money.format(selected.price)}</strong><p>{selected.beds} beds · {selected.baths} baths · {selected.sqft.toLocaleString()} sq ft<br/>Built {selected.yearBuilt??"unverified"} · {selected.listingStatus}</p><EmiCalculator house={selected}/><a href={selected.url} target="_blank" rel="noreferrer">Open {selected.source} listing ↗</a></>:<div className="map-sidebar-empty"><span>⌖</span><strong>Select a price pin</strong><p>The property name, photo, facts, financing estimate and listing link will open here.</p></div>}</aside></div>;
}

export default function HouseDashboard({ houses }: { houses: House[] }) {
  const [decisions, setDecisions] = useState<Decisions>({});
  const decisionsRef = useRef<Decisions>({});
  const [filters, setFilters] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState("price-desc");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [research, setResearch] = useState<ResearchRecords>(publishedResearch as ResearchRecords);
  const [researchSaving, setResearchSaving] = useState<string | null>(null);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  const [rebuildPin, setRebuildPin] = useState("");
  const [rebuildState, setRebuildState] = useState<RebuildState>({ status: "idle", requestedAt: "", completedAt: "" });
  const [rebuildError, setRebuildError] = useState("");
  const [rebuildSubmitting, setRebuildSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("tabular");
  const [negotiationHouse, setNegotiationHouse] = useState<House | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(compareStorageKey) ?? "[]") as string[];
      setCompareIds(stored.filter((id) => houses.some((house) => house.id === id)).slice(0, 4));
    } catch { setCompareIds([]); }
    let cancelled = false;
    const load = async () => {
      let local: Decisions = {};
      try { local = JSON.parse(localStorage.getItem(storageKey) ?? "{}"); } catch { local = {}; }
      let pending: Decisions = {};
      try { pending = JSON.parse(localStorage.getItem(outboxKey) ?? "{}"); } catch { pending = {}; }
      decisionsRef.current = local;
      setDecisions(local);
      try {
        const response = await fetch("/api/decisions", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load decisions");
        const { decisions: cloud = {} } = await response.json() as { decisions: Decisions };
        const shouldMigrate = localStorage.getItem(migrationKey) !== "done" && Object.keys(local).length > 0;
        const merged = { ...(shouldMigrate ? { ...cloud, ...local } : cloud), ...pending };
        if (shouldMigrate) {
          await Promise.all(Object.entries(local).map(([houseId, decision]) => fetch("/api/decisions", {
            method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ houseId, patch: decision }),
          }).then((result) => { if (!result.ok) throw new Error("Migration failed"); })));
          localStorage.setItem(migrationKey, "done");
        }
        const replayed = await Promise.all(Object.entries(pending).map(async ([houseId, decision]) => {
          const result = await fetch("/api/decisions", {
            method: "PUT", headers: { "content-type": "application/json" }, keepalive: true,
            body: JSON.stringify({ houseId, patch: decision }),
          });
          return result.ok ? houseId : null;
        }));
        const remaining = { ...pending };
        replayed.forEach((houseId) => { if (houseId) delete remaining[houseId]; });
        localStorage.setItem(outboxKey, JSON.stringify(remaining));
        if (!cancelled) {
          decisionsRef.current = merged;
          setDecisions(merged);
          localStorage.setItem(storageKey, JSON.stringify(merged));
          setLoadError(false);
          setHydrated(true);
        }
      } catch {
        if (!cancelled) { setLoadError(true); setHydrated(true); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    fetch("/api/rebuild", { cache: "no-store" }).then((response) => response.json() as Promise<RebuildState>).then(setRebuildState).catch(() => undefined);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/research", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("Unable to load research");
      return response.json() as Promise<{ research: ResearchRecords }>;
    }).then(({ research: records }) => { if (!cancelled) setResearch({ ...(records ?? {}), ...(publishedResearch as ResearchRecords) }); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const toggleCompare = (id: string) => {
    setCompareIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current;
      localStorage.setItem(compareStorageKey, JSON.stringify(next));
      if (!current.includes(id) && current.length < 4) setCompareOpen(true);
      return next;
    });
  };
  const requestResearch = async (house: House) => {
    const record: ResearchRecord = { houseId: house.id, address: `${house.address}, Eden Prairie, MN`, status: "requested", summary: "", sourcesChecked: "", checkedAt: "", updatedAt: new Date().toISOString() };
    setResearch((current) => ({ ...current, [house.id]: record }));
    setResearchSaving(house.id);
    try {
      const response = await fetch("/api/research", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
      if (!response.ok) throw new Error("Unable to request research");
    } finally { setResearchSaving(null); }
  };
  const submitRebuild = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRebuildSubmitting(true); setRebuildError("");
    try {
      const response = await fetch("/api/rebuild", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: rebuildPin }) });
      const body = await response.json() as RebuildState & { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to request rebuild");
      setRebuildState(body); setRebuildPin("");
    } catch (error) { setRebuildError(error instanceof Error ? error.message : "Unable to request rebuild"); }
    finally { setRebuildSubmitting(false); }
  };
  const update = async (id: string, patch: Partial<Decision>) => {
    const next = { ...(decisionsRef.current[id] ?? blank()), ...patch };
    const updated = { ...decisionsRef.current, [id]: next };
    decisionsRef.current = updated;
    setDecisions(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    let pending: Decisions = {};
    try { pending = JSON.parse(localStorage.getItem(outboxKey) ?? "{}"); } catch { pending = {}; }
    localStorage.setItem(outboxKey, JSON.stringify({ ...pending, [id]: next }));
    setSaving(id); setSaved(null);
    try {
      const response = await fetch("/api/decisions", { method: "PUT", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ houseId: id, patch: next }) });
      if (!response.ok) throw new Error("Unable to save");
      let queued: Decisions = {};
      try { queued = JSON.parse(localStorage.getItem(outboxKey) ?? "{}"); } catch { queued = {}; }
      if (JSON.stringify(queued[id]) === JSON.stringify(next)) {
        delete queued[id];
        localStorage.setItem(outboxKey, JSON.stringify(queued));
      }
      setSaved(id); setLoadError(false);
    } catch {
      setLoadError(true);
    } finally { setSaving(null); }
  };
  const filterOptions: FilterOption[] = [
    { label: "Under $400K", group: "price" }, { label: "$400–499K", group: "price" }, { label: "$500–599K", group: "price" }, { label: "$600–650K", group: "price" },
    { label: "Active", group: "status" }, { label: "Coming soon", group: "status" }, { label: "Contingent", group: "status" }, { label: "Pending", group: "status" }, { label: "Off market", group: "status" },
    { label: "Open houses", group: "listing" },
    { label: "Interested", group: "decision" }, { label: "Not interested", group: "decision" },
    { label: "Further action", group: "decision" }, { label: "Rejected", group: "decision" },
  ];
  const toggleFilter = (label: string) => {
    setShowAll(false);
    setFilters((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  };
  const visible = useMemo(() => {
    const filtered = houses.filter((house) => {
      const d = decisions[house.id] ?? blank();
      const selected = (group: FilterGroup) => filterOptions.filter((option) => option.group === group && filters.includes(option.label)).map((option) => option.label);
      const priceFilters = selected("price");
      const statusFilters = selected("status");
      const listingFilters = selected("listing");
      const decisionFilters = selected("decision");
      const isSuppressed = d.interest === "Not interested" || d.action === "Rejected";
      const revealsSuppressed = (d.interest === "Not interested" && decisionFilters.includes("Not interested")) || (d.action === "Rejected" && decisionFilters.includes("Rejected"));
      if (isSuppressed && !showAll && !revealsSuppressed) return false;
      const matchesPrice = priceFilters.length === 0 || priceFilters.some((item) => item === "Under $400K" ? house.price < 400000 : item === "$400–499K" ? house.price >= 400000 && house.price < 500000 : item === "$500–599K" ? house.price >= 500000 && house.price < 600000 : house.price >= 600000 && house.price <= 650000);
      const matchesStatus = statusFilters.length === 0 || statusFilters.includes(house.listingStatus);
      const matchesListing = listingFilters.length === 0 || (listingFilters.includes("Open houses") && house.openHouseStatus === "scheduled");
      const matchesDecision = decisionFilters.length === 0 || decisionFilters.some((item) => item === "Interested" ? d.interest === "Interested" : item === "Not interested" ? d.interest === "Not interested" : item === "Further action" ? d.action === "Further action" : d.action === "Rejected");
      const query = search.trim().toLowerCase();
      const matchesSearch = query.length === 0 || house.address.toLowerCase().includes(query);
      return matchesPrice && matchesStatus && matchesListing && matchesDecision && matchesSearch;
    });
    return [...filtered].sort((a, b) => {
      if (Boolean(a.isNew) !== Boolean(b.isNew)) return a.isNew ? -1 : 1;
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      if (sort === "payment-asc") return estimatePayment(a.price).total - estimatePayment(b.price).total;
      if (sort === "payment-desc") return estimatePayment(b.price).total - estimatePayment(a.price).total;
      if (sort === "year-desc") return (b.yearBuilt ?? -Infinity) - (a.yearBuilt ?? -Infinity);
      if (sort === "year-asc") return (a.yearBuilt ?? Infinity) - (b.yearBuilt ?? Infinity);
      if (sort === "source-asc") return a.source.localeCompare(b.source) || b.price - a.price;
      return b.source.localeCompare(a.source) || b.price - a.price;
    });
  }, [houses, decisions, filters, showAll, sort, search]);
  const compared = compareIds.map((id) => houses.find((house) => house.id === id)).filter((house): house is House => Boolean(house));
  const maxPrice = Math.max(...houses.map((h) => h.price));
  const scheduled = houses.filter((h) => h.openHouseStatus === "scheduled").length;
  const interested = houses.filter((h) => decisions[h.id]?.interest === "Interested").length;
  const fourHundreds = houses.filter((h) => h.price >= 400000 && h.price < 500000).length;
  const newlyAdded = houses.filter((h) => h.isNew).length;

  return <main>
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark">HH</span><span>House Hunt</span></a><nav><a href="#shortlist">Shortlist</a><a href="#compare">Compare</a><a href="#price-chart">Price chart</a><button className={`rebuild-button ${rebuildState.status}`} type="button" onClick={()=>{setRebuildOpen(true);setRebuildError("")}}>{rebuildState.status==="requested"?"Rebuild queued":"Manual rebuild"}</button><a className="zillow-link" href="https://www.zillow.com/eden-prairie-mn/under-700000/" target="_blank" rel="noreferrer">Open Zillow ↗</a></nav></header>
    {rebuildOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setRebuildOpen(false)}}><section className="rebuild-modal" role="dialog" aria-modal="true" aria-labelledby="rebuild-title"><button className="modal-close" type="button" onClick={()=>setRebuildOpen(false)} aria-label="Close manual rebuild dialog">×</button><p className="eyebrow">MANUAL INVENTORY REBUILD</p><h2 id="rebuild-title">Recheck every listing now</h2>{rebuildState.status==="requested"?<><div className="rebuild-success"><strong>Rebuild requested</strong><p>The request is queued for the next available House Hunt run. You can close this window.</p></div><button className="modal-primary" type="button" onClick={()=>setRebuildOpen(false)}>Done</button></>:<form onSubmit={submitRebuild}><label>Password<input autoFocus inputMode="numeric" type="password" value={rebuildPin} onChange={(event)=>setRebuildPin(event.target.value.replace(/\D/g,"").slice(0,4))} maxLength={4} placeholder="4-digit password" aria-describedby="rebuild-help"/></label><p id="rebuild-help">A correct password queues a complete Zillow, Homes.com and Redfin inventory rebuild.</p>{rebuildError&&<p className="rebuild-error" role="alert">{rebuildError}</p>}<button className="modal-primary" type="submit" disabled={rebuildPin.length!==4||rebuildSubmitting}>{rebuildSubmitting?"Checking…":"Trigger rebuild"}</button></form>}</section></div>}
    {negotiationHouse&&<NegotiationSimulator house={negotiationHouse} backgroundResearch={research[negotiationHouse.id]?.summary??""} onClose={()=>setNegotiationHouse(null)}/>}
      <section className="hero" id="top"><div><p className="eyebrow">EDEN PRAIRIE · DETACHED SINGLE-FAMILY ONLY · MAX $650K</p><h1>Your house hunt,<br/><em>rebuilt.</em></h1><p className="hero-copy">Full multi-page public inventory, deduplicated by address. Twin homes, townhomes and condos are excluded.</p></div><div className="sync-card"><span className="pulse"/><div><strong>Two-hour watch</strong><p>Checks every results page through $650,000 for new listings, status changes, prices, facade photos, construction year, and open houses.</p><small>Inventory rebuilt Sep 2, 2026<br/><span>Last refreshed Sep 2, 2026 · 2:00 PM CDT</span><b className="new-count">{newlyAdded} newly added since last refresh</b></small></div></div></section>
    <section className="metrics" aria-label="House hunt summary"><div><span>{houses.length}</span><p>Matches through $650K</p></div><div><span>{fourHundreds}</span><p>Homes from $400–499K</p></div><div><span>{scheduled}</span><p>Open houses flagged</p></div><div><span>{interested}</span><p>Marked interested</p></div></section>
    <section className="loan-assumptions" aria-label="Mortgage estimate assumptions"><div><p className="eyebrow">MORTGAGE ESTIMATE MODEL</p><h2>10% down payment estimate</h2></div><div className="loan-terms"><span><b>6.490%</b> interest</span><span><b>30 years</b> conventional</span><span><b>10%</b> down</span></div><p>Property cards apply one fixed rate assumption to every listing so the field stays comparable. Taxes and insurance use a $630.83 monthly allowance at a $500,000 purchase price, scaled proportionally to each price. Substitute your own rate, term, down payment and HOA with the per-house EMI calculator.</p></section>
    <section className="chart-section" id="price-chart"><div className="section-heading"><div><p className="eyebrow">PRICE LANDSCAPE</p><h2>See the field at a glance</h2></div><p>Asking price, highest first</p></div><div className="chart" role="img" aria-label="Horizontal bar chart comparing house prices">{houses.slice(0,7).map((h) => <div className="bar-row" key={h.id}><span>{h.address}</span><div className="bar-track"><div className="bar" style={{width:`${Math.max(22,h.price/maxPrice*100)}%`}}><b>{money.format(h.price)}</b></div></div></div>)}</div></section>
    <section className="shortlist" id="shortlist"><div className="section-heading"><div><p className="eyebrow">DECISION BOARD</p><h2>Homes worth your attention</h2><p>{visible.length} of {houses.length} homes shown{showAll ? " · all designations shown" : filters.length > 0 ? ` · ${filters.length} filters selected` : ""}{search.trim() ? ` · street search: “${search.trim()}”` : ""}</p></div><div className="board-controls"><label className="street-search"><span>Search by street name or number</span><input type="search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Try Duck Lake or 18220" aria-label="Search homes by street name or number"/>{search&&<button type="button" onClick={()=>setSearch("")} aria-label="Clear street search">Clear</button>}</label><label className="sort-control"><span>Sort homes</span><select value={sort} onChange={(event)=>setSort(event.target.value)} aria-label="Sort homes"><option value="price-desc">Price: high to low</option><option value="price-asc">Price: low to high</option><option value="payment-desc">Monthly mortgage: high to low</option><option value="payment-asc">Monthly mortgage: low to high</option><option value="year-desc">Year built: newest first</option><option value="year-asc">Year built: oldest first</option><option value="source-asc">Source: A to Z</option><option value="source-desc">Source: Z to A</option></select></label><div className="filters" role="group" aria-label="Filter homes"><button className={showAll?"active":""} onClick={()=>{setFilters([]);setShowAll(true)}} aria-pressed={showAll}>All</button>{filterOptions.map((item) => <button key={item.label} className={filters.includes(item.label)?"active":""} onClick={()=>toggleFilter(item.label)} aria-pressed={filters.includes(item.label)}>{item.label}</button>)}</div></div></div><div className="view-switcher" role="tablist" aria-label="Choose house display"><button type="button" role="tab" aria-selected={viewMode==="tabular"} className={viewMode==="tabular"?"active":""} onClick={()=>setViewMode("tabular")}>☷ Tabular</button><button type="button" role="tab" aria-selected={viewMode==="grid"} className={viewMode==="grid"?"active":""} onClick={()=>setViewMode("grid")}>▦ Grid</button><button type="button" role="tab" aria-selected={viewMode==="graph"} className={viewMode==="graph"?"active":""} onClick={()=>setViewMode("graph")}>⌖ Graph</button></div>{viewMode==="graph"?<MapView houses={visible}/>:<div className={`house-list ${viewMode}`}>
      {visible.map((house,index) => { const d=decisions[house.id]??blank(); const statusClass=house.listingStatus.toLowerCase().replace(" ","-"); const payment=estimatePayment(house.price); const isCompared=compareIds.includes(house.id); const researchState=research[house.id]?.status; return <article className={`house-card ${house.isNew?"new-house":""}`} key={house.id}><div className="rank">{String(index+1).padStart(2,"0")}</div><a className={`house-photo ${house.image?"":"photo-missing"}`} href={house.url} target="_blank" rel="noreferrer" aria-label={`Open ${house.source} listing for ${house.address}`}>{house.image?<img src={house.image} alt={`Front exterior of ${house.address}`} loading="lazy" referrerPolicy="no-referrer"/>:<><span>Facade photo<br/>not available</span><small>Open listing ↗</small></>}<b>{house.isNew?"NEW THIS REFRESH":"FRONT EXTERIOR"}</b></a><div className="house-main"><div className="house-title"><div><div className="address-line"><h3>{house.address}</h3>{house.isNew&&<span className="new-badge">New</span>}<span className={`listing-status ${statusClass}`}>{house.listingStatus}</span></div><p>Eden Prairie, MN · {house.type}</p></div><strong>{money.format(house.price)}</strong></div><div className="card-actions"><button type="button" className={isCompared?"selected":""} onClick={()=>toggleCompare(house.id)} disabled={!isCompared&&compareIds.length>=4}>{isCompared?"✓ Selected":"＋ Compare"}</button><button type="button" className={researchState?"selected":""} onClick={()=>{if(!isCompared)toggleCompare(house.id);void requestResearch(house);setCompareOpen(true);setTimeout(()=>document.getElementById("research")?.scrollIntoView({behavior:"smooth"}),0)}} disabled={researchSaving===house.id||(!isCompared&&compareIds.length>=4)}>{researchSaving===house.id?"Requesting…":researchState==="requested"?"Research requested":researchState?"Recheck background":"Research property"}</button><button type="button" className="simulate-button" onClick={()=>setNegotiationHouse(house)}>⚖ Simulate negotiation</button></div><div className="facts"><span>{house.beds} beds</span><span>{house.baths} baths</span><span>{house.sqft.toLocaleString()} sq ft</span><span>Built {house.yearBuilt}</span><span>{money.format(Math.round(house.price/house.sqft))}/sq ft</span><a href={house.url} target="_blank" rel="noreferrer">Source: {house.source} ↗</a></div><div className="mortgage-estimate"><div><span>EST. TOTAL / MONTH</span><strong>{money.format(payment.total)}</strong></div><p><b>{money.format(payment.down)}</b> down · <b>{money.format(payment.loan)}</b> loan<br/><b>{money.format(payment.principalInterest)}</b> P&amp;I + <b>{money.format(payment.taxesInsurance)}</b> estimated taxes &amp; insurance</p></div><div className={`open-house ${house.openHouseStatus}`}><span>OPEN HOUSE</span><b>{house.openHouse}</b><a href={house.url} target="_blank" rel="noreferrer">Verify on {house.source} ↗</a></div></div><div className="decision-panel">
        <EmiCalculator house={house}/>
        <label>Interest<select disabled={!hydrated} value={d.interest} onChange={(e)=>update(house.id,{interest:e.target.value})}><option>Undecided</option><option>Interested</option><option>Not interested</option></select></label>
        <label>Disposition<select disabled={!hydrated} value={d.action} onChange={(e)=>update(house.id,{action:e.target.value})}><option>None</option><option>Further action</option><option>Rejected</option></select></label>
        <label>Notes<textarea disabled={!hydrated} aria-label={`Notes for ${house.address}`} placeholder="Tour notes, questions, concerns…" value={d.notes} onChange={(e)=>{ const updated={...decisionsRef.current,[house.id]:{...(decisionsRef.current[house.id]??blank()),notes:e.target.value}}; decisionsRef.current=updated; setDecisions(updated); localStorage.setItem(storageKey,JSON.stringify(updated)); }} onBlur={(e)=>update(house.id,{notes:e.target.value})}/></label>
        <small>{!hydrated?"Loading saved choices…":saving===house.id?"Saving…":saved===house.id?"Saved":"Changes save automatically"}</small>
      </div></article>; })}
      {visible.length === 0 && <div className="empty-state"><strong>No homes match these filters.</strong><p>Clear one or more filters to widen the list.</p></div>}
    </div>}{loadError&&<p className="save-warning" role="status">Cloud save is temporarily unavailable. Your latest changes are still kept on this device and will be retried when you reopen the dashboard.</p>}</section>
    <section className="compare-section" id="compare"><div className="section-heading"><div><p className="eyebrow">COMPARE &amp; RESEARCH</p><h2>Make the trade-offs visible</h2><p>Select up to four homes. Your comparison stays on this device when you return.</p></div><button className="compare-toggle" type="button" onClick={()=>setCompareOpen((open)=>!open)} disabled={compared.length===0}>{compareOpen?"Hide workspace":`Open comparison (${compared.length}/4)`}</button></div>
      {compared.length===0?<div className="compare-empty"><strong>No homes selected yet.</strong><p>Use “Compare” or “Research property” on any listing card.</p></div>:compareOpen&&<><div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>Measure</th>{compared.map((house)=><th key={house.id}><button type="button" onClick={()=>toggleCompare(house.id)} aria-label={`Remove ${house.address} from comparison`}>×</button>{house.address}</th>)}</tr></thead><tbody><tr><th>Facade</th>{compared.map((house)=><td key={house.id}>{house.image?<img src={house.image} alt={`Front exterior of ${house.address}`} referrerPolicy="no-referrer"/>:<span>Not available</span>}</td>)}</tr><tr><th>Price</th>{compared.map((house)=><td key={house.id}><strong>{money.format(house.price)}</strong></td>)}</tr><tr><th>Est. monthly</th>{compared.map((house)=><td key={house.id}>{money.format(estimatePayment(house.price).total)}</td>)}</tr><tr><th>Home</th>{compared.map((house)=><td key={house.id}>{house.beds} bd · {house.baths} ba<br/>{house.sqft.toLocaleString()} sq ft</td>)}</tr><tr><th>Built</th>{compared.map((house)=><td key={house.id}>{house.yearBuilt??"Unverified"}</td>)}</tr><tr><th>Price / sq ft</th>{compared.map((house)=><td key={house.id}>{money.format(Math.round(house.price/house.sqft))}</td>)}</tr><tr><th>Status</th>{compared.map((house)=><td key={house.id}>{house.listingStatus}</td>)}</tr><tr><th>Open house</th>{compared.map((house)=><td key={house.id}>{house.openHouse}</td>)}</tr><tr><th>Your decision</th>{compared.map((house)=>{const d=decisions[house.id]??blank();return <td key={house.id}>{d.interest}<br/><small>{d.action}</small></td>})}</tr></tbody></table></div>
      <div className="research-grid" id="research">{compared.map((house)=>{const item=research[house.id];return <article className="research-card" key={house.id}><div><p className="eyebrow">BACKGROUND RESEARCH</p><h3>{house.address}</h3><p>I search public web results and official records for address-specific crime reports and property history. I do not infer that an incident involved the home unless the address can be verified.</p></div><div className={`research-result ${item?.status??"not-requested"}`}>{!item?<><strong>Not requested</strong><p>Designate this property and the next House Hunt research pass will investigate it.</p><button type="button" onClick={()=>void requestResearch(house)}>Request research</button></>:item.status==="requested"?<><strong>Research queued</strong><p>The next refresh will search for past crimes and relevant address history, then place the findings here.</p></>:<><strong>{item.status==="not-found"?"No verified address-specific records found":"Research completed"}</strong><p>{item.summary||"No summary was published."}</p>{item.sourcesChecked&&<small>Sources checked: {item.sourcesChecked}</small>}{item.checkedAt&&<small>Checked {item.checkedAt}</small>}<button type="button" onClick={()=>void requestResearch(house)}>Request a fresh check</button></>}</div></article>})}</div></>}
    </section>
    <footer><span>House Hunt · Eden Prairie</span><p>Payment estimates are planning figures, not a Loan Estimate. Exact property tax, homeowners insurance, PMI, HOA, points, closing costs, and final rate may change the payment. Verify listing details with the named source.</p></footer>
  </main>;
}
