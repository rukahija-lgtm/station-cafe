import { useState, useCallback, useEffect, useRef } from "react";

const DEFAULT_THEME = {
  bg: "#0a0a0a",
  surface: "#141414",
  surfaceAlt: "#1c1c1c",
  border: "#2a2a2a",
  borderHover: "#444",
  accentSub: "#888",
  text: "#f0f0f0",
  textMuted: "#555",
  highlight: "#ffffff",
  tag: "#1c1c1c",
};

const PRESETS = [
  { label: "Noir", t: { bg:"#0a0a0a",surface:"#141414",surfaceAlt:"#1c1c1c",border:"#2a2a2a",borderHover:"#444",accentSub:"#888",text:"#f0f0f0",textMuted:"#555",highlight:"#ffffff",tag:"#1c1c1c" } },
  { label: "Slate", t: { bg:"#0d1117",surface:"#161b22",surfaceAlt:"#21262d",border:"#30363d",borderHover:"#484f58",accentSub:"#8b949e",text:"#e6edf3",textMuted:"#484f58",highlight:"#f0f6fc",tag:"#21262d" } },
  { label: "Warm Ash", t: { bg:"#0f0d0b",surface:"#181512",surfaceAlt:"#201c18",border:"#2e2821",borderHover:"#4a4038",accentSub:"#9c8a78",text:"#f0e8dc",textMuted:"#5a4e44",highlight:"#fff8f0",tag:"#201c18" } },
  { label: "Navy", t: { bg:"#070a10",surface:"#0d1220",surfaceAlt:"#121a2e",border:"#1e2d48",borderHover:"#2e4070",accentSub:"#6888b0",text:"#dce8f8",textMuted:"#3a4e68",highlight:"#f0f8ff",tag:"#121a2e" } },
  { label: "Forest", t: { bg:"#080d09",surface:"#0f160f",surfaceAlt:"#141e14",border:"#1e2c1e",borderHover:"#2e482e",accentSub:"#6a9a6a",text:"#d8ecd8",textMuted:"#3a5a3a",highlight:"#f0fff0",tag:"#141e14" } },
];

function ls(key, fb) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fb; } catch { return fb; }
}
function ss(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }

export default function App() {
  const [theme, setTheme] = useState(() => ls("scf_theme", DEFAULT_THEME));
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("exits");
  const [history, setHistory] = useState(() => ls("scf_history", []));
  const [favorites, setFavorites] = useState(() => ls("scf_favorites", []));
  const [panel, setPanel] = useState(null);
  const [geo, setGeo] = useState(null);

  useEffect(() => { ss("scf_theme", theme); }, [theme]);
  useEffect(() => { ss("scf_history", history); }, [history]);
  useEffect(() => { ss("scf_favorites", favorites); }, [favorites]);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}
    );
  }, []);

  const T = theme;

  const handleSearch = useCallback(async (q) => {
    const query = (q || destination).trim();
    if (!query) return;
    if (!q) setDestination(query);
    setLoading(true); setResult(null); setError(null); setPanel(null);

    const locHint = geo
      ? ユーザーの現在地: 緯度${geo.lat.toFixed(4)}, 経度${geo.lng.toFixed(4)}付近。同一企業名・同一チェーン複数拠点は現在地に近い順でソートしてください。
      : "現在地不明。日本の都市部を想定してください。";

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `あなたは日本のビジネス訪問向けナビゲーションの専門家です。
${locHint}

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
- JSONのみ返すこと。`,
          messages: [{ role: "user", content: 目的地: ${query} }]
        })
      });

      const data = await res.json();
      const txt = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error();
      const parsed = JSON.parse(m[0]);
      setResult(parsed);
      setActiveTab("exits");
      setHistory(prev => [{ query, dest: parsed.destination, ts: Date.now() }, ...prev.filter(h => h.query !== query)].slice(0, 5));
    } catch {
      setError("情報を取得できませんでした。再度お試しください。");
    } finally { setLoading(false); }
  }, [destination, geo]);

  const isFav = result && favorites.some(f => f.dest === result.destination);
  const toggleFav = () => {
    if (!result) return;
    setFavorites(prev =>
      isFav ? prev.filter(f => f.dest !== result.destination)
             : [{ dest: result.destination, query: destination, station: result.nearestStation?.name, ts: Date.now() }, ...prev].slice(0, 20)
    );
  };

  const fmt = ts => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`; };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px" };
  const tag = { display:"inline-block", background: T.tag, border:`1px solid ${T.border}`, borderRadius:5, padding:"2px 8px", fontSize:11, color: T.accentSub };
  const iconBtn = (active) => ({
    background: active ? T.surfaceAlt : "transparent",
    border: `1px solid ${active ? T.borderHover : T.border}`,
    borderRadius: 8, width: 34, height: 34,
    display:"flex", alignItems:"center", justifyContent:"center",
    cursor:"pointer", color: active ? T.text : T.textMuted, fontSize:15,
    transition:"all 0.15s", flexShrink:0,
  });
  const tabBtn = (active) => ({
    flex:1, background: active ? T.surfaceAlt : "transparent",
    border:`1px solid ${active ? T.borderHover : T.border}`,
    borderRadius:7, padding:"8px 6px",
    color: active ? T.text : T.textMuted,
    fontSize:12, fontWeight: active ? 700 : 400,
    cursor:"pointer", letterSpacing:"0.04em", transition:"all 0.15s", fontFamily:"inherit",
  });
  const sidePanel = {
    position:"fixed", top:0, right:0, width:280, height:"100vh",
    background: T.surface, borderLeft:`1px solid ${T.border}`,
    zIndex:90, display:"flex", flexDirection:"column", overflowY:"auto",
  };
  const panelHead = {
    padding:"16px", borderBottom:`1px solid ${T.border}`,
    display:"flex", alignItems:"center", justifyContent:"space-between",
  };
  const mono = { fontFamily:"'DM Mono','Courier New',monospace" };
  const closeBtn = { background:"none", border:"none", color: T.textMuted, fontSize:18, cursor:"pointer" };

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'DM Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif", fontSize:14 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input::placeholder{color:${T.textMuted};}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .fu{animation:fadeUp 0.22s ease both;}
      `}</style>

      {/* Header */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:"14px 16px", display:"flex", alignItems:"center", gap:10, position:"sticky", top:0, zIndex:50 }}>
        <div style={{ flex:1 }}>
          <div style={{ ...mono, fontSize:13, fontWeight:700, letterSpacing:"0.12em", color:T.highlight, textTransform:"uppercase" }}>StationCafe</div>
          <div style={{ fontSize:9, color:T.textMuted, letterSpacing:"0.2em", textTransform:"uppercase", marginTop:1 }}>Business Navigator</div>
        </div>
        {geo && <div style={{ ...tag, fontSize:10 }}>📍 GPS</div>}
        <button style={iconBtn(panel==="history")} onClick={() => setPanel(panel==="history"?null:"history")} title="検索履歴">🕐</button>
        <button style={iconBtn(panel==="favorites")} onClick={() => setPanel(panel==="favorites"?null:"favorites")} title="お気に入り">☆</button>
        <button style={iconBtn(panel==="settings")} onClick={() => setPanel(panel==="settings"?null:"settings")} title="設定">⚙</button>
      </div>

      {/* Search */}
      <div style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:"14px 16px" }}>
        <input
          value={destination}
          onChange={e => setDestination(e.target.value)}
          onKeyDown={e => e.key==="Enter" && handleSearch()}
          placeholder="会社名・施設名・住所を入力..."
          style={{ width:"100%", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 12px", color:T.text, fontSize:14, outline:"none", fontFamily:"inherit" }}
        />
        <button
          onClick={() => handleSearch()}
          disabled={loading || !destination.trim()}
          style={{ marginTop:8, width:"100%", background: loading||!destination.trim() ? T.surfaceAlt : T.highlight, border:"none", borderRadius:8, padding:"10px", color: loading||!destination.trim() ? T.textMuted : T.bg, fontSize:13, fontWeight:700, cursor: loading||!destination.trim()?"not-allowed":"pointer", letterSpacing:"0.08em", fontFamily:"inherit", transition:"all 0.15s" }}
        >
          {loading ? "SEARCHING..." : "SEARCH"}
        </button>
      </div>

      {/* Body */}
      <div style={{ padding:"14px 16px 48px" }}>

        {loading && (
          <div style={{ textAlign:"center", padding:"48px 0" }}>
            <div style={{ width:26, height:26, border:`2px soli