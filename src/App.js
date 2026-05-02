/* eslint-disable */
import { useState, useCallback, useEffect } from "react";

const DEFAULT_THEME = {
  bg: "#0a0a0a", surface: "#141414", surfaceAlt: "#1c1c1c",
  border: "#2a2a2a", borderHover: "#444", accentSub: "#888",
  text: "#f0f0f0", textMuted: "#555", highlight: "#ffffff", tag: "#1c1c1c",
};

const PRESETS = [
  { label: "Noir",     t: { bg:"#0a0a0a",surface:"#141414",surfaceAlt:"#1c1c1c",border:"#2a2a2a",borderHover:"#444",   accentSub:"#888",   text:"#f0f0f0",textMuted:"#555",  highlight:"#ffffff",tag:"#1c1c1c" } },
  { label: "Slate",    t: { bg:"#0d1117",surface:"#161b22",surfaceAlt:"#21262d",border:"#30363d",borderHover:"#484f58",accentSub:"#8b949e",text:"#e6edf3",textMuted:"#484f58",highlight:"#f0f6fc",tag:"#21262d" } },
  { label: "Warm Ash", t: { bg:"#0f0d0b",surface:"#181512",surfaceAlt:"#201c18",border:"#2e2821",borderHover:"#4a4038",accentSub:"#9c8a78",text:"#f0e8dc",textMuted:"#5a4e44",highlight:"#fff8f0",tag:"#201c18" } },
  { label: "Navy",     t: { bg:"#070a10",surface:"#0d1220",surfaceAlt:"#121a2e",border:"#1e2d48",borderHover:"#2e4070",accentSub:"#6888b0",text:"#dce8f8",textMuted:"#3a4e68",highlight:"#f0f8ff",tag:"#121a2e" } },
  { label: "Forest",   t: { bg:"#080d09",surface:"#0f160f",surfaceAlt:"#141e14",border:"#1e2c1e",borderHover:"#2e482e",accentSub:"#6a9a6a",text:"#d8ecd8",textMuted:"#3a5a3a",highlight:"#f0fff0",tag:"#141e14" } },
];

const CAFE_SYSTEM = (locHint) => ("あなたは日本のビジネス訪問向けナビゲーションの専門家です。
" + locHint + "
以下のJSON形式のみで返してください。マークダウンやコードブロック、説明文は一切不要です。
{
  "destination": "目的地の正式名称",
  "candidates": [
    { "name": "企業・施設名", "address": "住所", "note": "支店・営業所など補足" }
  ],
  "nearestStation": {
    "name": "最寄り駅名",
    "line": "路線名（複数ならカンマ区切り）",
    "exits": [
      { "name": "出口名", "description": "目的地への道案内", "distance": "徒歩○分" }
    ]
  },
  "cafes": [
    { "name": "店舗名", "address": "住所", "distance": "目的地から徒歩○分", "priceRange": "¥XXX〜¥XXX" }
  ]
}
ルール:
- candidates: 同名企業・同一チェーン複数拠点は現在地に近い順で最大3件。単独でも配列で。
- nearestStation・cafesはcandidates[0]基準。
- cafes: ドトール・エクセルシオール・スターバックス・サンマルクカフェ・タリーズ・ベローチェ・プロント・カフェ・ド・クリエ・上島珈琲・ルノアール等、コーヒー・紅茶400円前後〜500円程度のチェーン系カフェのみ。コメダ珈琲は除外。
- JSONのみ返すこと。");

const NEARBY_SYSTEM = (lat, lng) => ("あなたは日本のカフェ情報専門家です。
ユーザーの現在地: 緯度" + lat.toFixed(5) + ", 経度" + lng.toFixed(5) + "
以下のJSON形式のみで返してください。マークダウンやコードブロック、説明文は一切不要です。
{
  "area": "現在地の町名・エリア名",
  "nearestStation": { "name": "最寄り駅名", "line": "路線名", "distance": "徒歩○分" },
  "cafes": [
    { "name": "店舗名（チェーン名含む）", "address": "住所", "distance": "現在地から徒歩○分", "priceRange": "¥XXX〜¥XXX", "openHours": "営業時間（わかれば）" }
  ]
}
ルール:
- cafes: ドトール・エクセルシオール・スターバックス・サンマルクカフェ・タリーズ・ベローチェ・プロント・カフェ・ド・クリエ・上島珈琲・ルノアール等、コーヒー・紅茶400円前後〜500円程度のチェーン系カフェのみ。コメダ珈琲は除外。現在地から近い順に最大6件。
- JSONのみ返すこと。");

function ls(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e) { return fb; } }
function ss(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }

async function callClaude(system, userMsg) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system,
      messages: [{ role: "user", content: userMsg }]
    })
  });
  const data = await res.json();
  const txt = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("parse");
  return JSON.parse(m[0]);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme]       = useState(() => ls("scf_theme", DEFAULT_THEME));
  const [mainTab, setMainTab]   = useState("search");   // "search" | "nearby"
  const [destination, setDest]  = useState("");
  const [activeTab, setActiveTab] = useState("exits");

  // Search state
  const [srchLoading, setSrchLoading] = useState(false);
  const [srchResult,  setSrchResult]  = useState(null);
  const [srchError,   setSrchError]   = useState(null);

  // Nearby state
  const [nearLoading, setNearLoading] = useState(false);
  const [nearResult,  setNearResult]  = useState(null);
  const [nearError,   setNearError]   = useState(null);

  const [history,   setHistory]   = useState(() => ls("scf_history",   []));
  const [favorites, setFavorites] = useState(() => ls("scf_favorites", []));
  const [panel,     setPanel]     = useState(null);
  const [geo,       setGeo]       = useState(null);
  const [geoError,  setGeoError]  = useState(false);

  useEffect(() => { ss("scf_theme",     theme);     }, [theme]);
  useEffect(() => { ss("scf_history",   history);   }, [history]);
  useEffect(() => { ss("scf_favorites", favorites); }, [favorites]);

  // GPS取得（Android WebViewからも呼ばれる）
  const getGeo = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("no_geo")); return; }
    navigator.geolocation.getCurrentPosition(
      p => { const g = { lat: p.coords.latitude, lng: p.coords.longitude }; setGeo(g); setGeoError(false); resolve(g); },
      () => { setGeoError(true); reject(new Error("denied")); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }), []);

  useEffect(() => { getGeo().catch(() => {}); }, []);

  const T = theme;

  // ── 目的地検索 ──────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async (q) => {
    const query = (q || destination).trim();
    if (!query) return;
    if (!q) setDest(query);
    setSrchLoading(true); setSrchResult(null); setSrchError(null); setPanel(null);
    const locHint = geo
      ? ("ユーザーの現在地: 緯度" + geo.lat.toFixed(4) + ", 経度" + geo.lng.toFixed(4) + "付近。同一企業名・同一チェーン複数拠点は現在地に近い順でソートしてください。")
      : "現在地不明。日本の都市部を想定してください。";
    try {
      const parsed = await callClaude(CAFE_SYSTEM(locHint), ("目的地: " + query));
      setSrchResult(parsed);
      setActiveTab("exits");
      setHistory(prev => [{ query, dest: parsed.destination, ts: Date.now() }, ...prev.filter(h => h.query !== query)].slice(0, 5));
    } catch(e) {
      setSrchError("情報を取得できませんでした。再度お試しください。");
    } finally { setSrchLoading(false); }
  }, [destination, geo]);

  // ── 現在地カフェ検索 ────────────────────────────────────────────────────────
  const handleNearby = useCallback(async () => {
    setNearLoading(true); setNearResult(null); setNearError(null);
    try {
      let g = geo;
      if (!g) g = await getGeo();
      const parsed = await callClaude(NEARBY_SYSTEM(g.lat, g.lng), ("現在地周辺の格安カフェを教えてください。緯度:" + g.lat.toFixed(5) + ", 経度:" + g.lng.toFixed(5)));
      setNearResult(parsed);
    } catch (e) {
      setNearError(e.message === "denied" ? "位置情報の取得が許可されていません。設定からGPSを許可してください。" : "情報を取得できませんでした。再度お試しください。");
    } finally { setNearLoading(false); }
  }, [geo, getGeo]);

  // ── お気に入り ──────────────────────────────────────────────────────────────
  const isFav = srchResult && favorites.some(f => f.dest === srchResult.destination);
  const toggleFav = () => {
    if (!srchResult) return;
    setFavorites(prev =>
      isFav ? prev.filter(f => f.dest !== srchResult.destination)
            : [{ dest: srchResult.destination, query: destination, station: srchResult.nearestStation?.name, ts: Date.now() }, ...prev].slice(0, 20)
    );
  };

  const fmt = ts => { const d = new Date(ts); return (d.getMonth()+1 + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2,"0")); };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card    = { background: T.surface, border: ("1px solid " + T.border), borderRadius: 10, padding: "14px" };
  const tag     = { display:"inline-block", background: T.tag, border:("1px solid " + T.border), borderRadius:5, padding:"2px 8px", fontSize:11, color: T.accentSub };
  const mono    = { fontFamily:"'DM Mono','Courier New',monospace" };
  const closeBtn = { background:"none", border:"none", color:T.textMuted, fontSize:18, cursor:"pointer" };

  const iconBtn = (active) => ({
    background: active ? T.surfaceAlt : "transparent",
    border: ("1px solid " + active ? T.borderHover : T.border),
    borderRadius:8, width:34, height:34,
    display:"flex", alignItems:"center", justifyContent:"center",
    cursor:"pointer", color: active ? T.text : T.textMuted, fontSize:15,
    transition:"all 0.15s", flexShrink:0,
  });
  const subTabBtn = (active) => ({
    flex:1, background: active ? T.surfaceAlt : "transparent",
    border:("1px solid " + active ? T.borderHover : T.border),
    borderRadius:7, padding:"8px 6px",
    color: active ? T.text : T.textMuted,
    fontSize:12, fontWeight: active ? 700 : 400,
    cursor:"pointer", letterSpacing:"0.04em", transition:"all 0.15s", fontFamily:"inherit",
  });
  const sidePanel = {
    position:"fixed", top:0, right:0, width:280, height:"100vh",
    background:T.surface, borderLeft:("1px solid " + T.border),
    zIndex:90, display:"flex", flexDirection:"column", overflowY:"auto",
  };
  const panelHead = {
    padding:"16px", borderBottom:("1px solid " + T.border),
    display:"flex", alignItems:"center", justifyContent:"space-between",
  };

  // ── Bottom nav tab ──────────────────────────────────────────────────────────
  const navTab = (id, label, icon) => ({
    style: {
      flex:1, background:"none", border:"none",
      borderTop: mainTab===id ? ("2px solid " + T.highlight) : `2px solid transparent`,
      padding:"10px 0 8px",
      color: mainTab===id ? T.highlight : T.textMuted,
      fontSize:10, fontWeight: mainTab===id ? 700 : 400,
      cursor:"pointer", fontFamily:"inherit", letterSpacing:"0.08em",
      display:"flex", flexDirection:"column", alignItems:"center", gap:3,
      transition:"all 0.15s",
    },
    onClick: () => setMainTab(id),
    children: <>{icon}<span>{label}</span></>
  });

  return (
    <div style={{ minHeight:"100vh", backgroun