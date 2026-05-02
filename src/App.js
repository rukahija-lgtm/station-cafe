/* eslint-disable */
import { useState, useCallback, useEffect } from "react";

var DEFAULT_THEME = {
  bg: "#0a0a0a", surface: "#141414", surfaceAlt: "#1c1c1c",
  border: "#2a2a2a", borderHover: "#444", accentSub: "#888",
  text: "#f0f0f0", textMuted: "#555", highlight: "#ffffff", tag: "#1c1c1c",
};

var PRESETS = [
  { label: "Noir",     t: { bg:"#0a0a0a",surface:"#141414",surfaceAlt:"#1c1c1c",border:"#2a2a2a",borderHover:"#444",   accentSub:"#888",   text:"#f0f0f0",textMuted:"#555",  highlight:"#ffffff",tag:"#1c1c1c" } },
  { label: "Slate",    t: { bg:"#0d1117",surface:"#161b22",surfaceAlt:"#21262d",border:"#30363d",borderHover:"#484f58",accentSub:"#8b949e",text:"#e6edf3",textMuted:"#484f58",highlight:"#f0f6fc",tag:"#21262d" } },
  { label: "Warm Ash", t: { bg:"#0f0d0b",surface:"#181512",surfaceAlt:"#201c18",border:"#2e2821",borderHover:"#4a4038",accentSub:"#9c8a78",text:"#f0e8dc",textMuted:"#5a4e44",highlight:"#fff8f0",tag:"#201c18" } },
  { label: "Navy",     t: { bg:"#070a10",surface:"#0d1220",surfaceAlt:"#121a2e",border:"#1e2d48",borderHover:"#2e4070",accentSub:"#6888b0",text:"#dce8f8",textMuted:"#3a4e68",highlight:"#f0f8ff",tag:"#121a2e" } },
  { label: "Forest",   t: { bg:"#080d09",surface:"#0f160f",surfaceAlt:"#141e14",border:"#1e2c1e",borderHover:"#2e482e",accentSub:"#6a9a6a",text:"#d8ecd8",textMuted:"#3a5a3a",highlight:"#f0fff0",tag:"#141e14" } },
];

function ls(k, fb) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch(e) { return fb; } }
function ss(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }

async function callClaude(system, userMsg) {
  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system: system,
      messages: [{ role: "user", content: userMsg }]
    })
  });
  var data = await res.json();
  var txt = data.content.filter(function(b) { return b.type === "text"; }).map(function(b) { return b.text; }).join("");
  var m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("parse");
  return JSON.parse(m[0]);
}

function makeCafeSystem(locHint) {
  return "あなたは日本のビジネス訪問向けナビゲーションの専門家です。\n" + locHint + "\n以下のJSON形式のみで返してください。マークダウンやコードブロック、説明文は一切不要です。\n{\n  \"destination\": \"目的地の正式名称\",\n  \"candidates\": [\n    { \"name\": \"企業・施設名\", \"address\": \"住所\", \"note\": \"支店・営業所など補足\" }\n  ],\n  \"nearestStation\": {\n    \"name\": \"最寄り駅名\",\n    \"line\": \"路線名\",\n    \"exits\": [\n      { \"name\": \"出口名\", \"description\": \"目的地への道案内\", \"distance\": \"徒歩○分\" }\n    ]\n  },\n  \"cafes\": [\n    { \"name\": \"店舗名\", \"address\": \"住所\", \"distance\": \"目的地から徒歩○分\", \"priceRange\": \"¥XXX〜¥XXX\" }\n  ]\n}\nルール: candidates同名企業は現在地に近い順で最大3件。cafesはドトール・スタバ・タリーズ・サンマルク・ベローチェ・プロント等400円前後のチェーン系のみ。JSONのみ返すこと。";
}

function makeNearbySystem(lat, lng) {
  return "あなたは日本のカフェ情報専門家です。ユーザーの現在地: 緯度" + lat + ", 経度" + lng + "\n以下のJSON形式のみで返してください。\n{\n  \"area\": \"現在地の町名・エリア名\",\n  \"nearestStation\": { \"name\": \"最寄り駅名\", \"line\": \"路線名\", \"distance\": \"徒歩○分\" },\n  \"cafes\": [\n    { \"name\": \"店舗名\", \"address\": \"住所\", \"distance\": \"現在地から徒歩○分\", \"priceRange\": \"¥XXX〜¥XXX\", \"openHours\": \"営業時間\" }\n  ]\n}\nルール: cafesはドトール・スタバ・タリーズ・サンマルク・ベローチェ・プロント等400円前後のチェーン系のみ。現在地から近い順に最大6件。JSONのみ返すこと。";
}

export default function App() {
  var [theme, setTheme]         = useState(function() { return ls("scf_theme", DEFAULT_THEME); });
  var [mainTab, setMainTab]     = useState("search");
  var [destination, setDest]    = useState("");
  var [activeTab, setActiveTab] = useState("exits");
  var [srchLoading, setSrchLoading] = useState(false);
  var [srchResult,  setSrchResult]  = useState(null);
  var [srchError,   setSrchError]   = useState(null);
  var [nearLoading, setNearLoading] = useState(false);
  var [nearResult,  setNearResult]  = useState(null);
  var [nearError,   setNearError]   = useState(null);
  var [history,   setHistory]   = useState(function() { return ls("scf_history",   []); });
  var [favorites, setFavorites] = useState(function() { return ls("scf_favorites", []); });
  var [panel,     setPanel]     = useState(null);
  var [geo,       setGeo]       = useState(null);
  var [geoError,  setGeoError]  = useState(false);

  useEffect(function() { ss("scf_theme",     theme);     }, [theme]);
  useEffect(function() { ss("scf_history",   history);   }, [history]);
  useEffect(function() { ss("scf_favorites", favorites); }, [favorites]);

  var getGeo = useCallback(function() {
    return new Promise(function(resolve, reject) {
      if (!navigator.geolocation) { reject(new Error("no_geo")); return; }
      navigator.geolocation.getCurrentPosition(
        function(p) { var g = { lat: p.coords.latitude, lng: p.coords.longitude }; setGeo(g); setGeoError(false); resolve(g); },
        function() { setGeoError(true); reject(new Error("denied")); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }, []);

  useEffect(function() { getGeo().catch(function(){}); }, []);

  var T = theme;

  var handleSearch = useCallback(async function(q) {
    var query = (q || destination).trim();
    if (!query) return;
    if (!q) setDest(query);
    setSrchLoading(true); setSrchResult(null); setSrchError(null); setPanel(null);
    var locHint = geo
      ? "ユーザーの現在地: 緯度" + geo.lat.toFixed(4) + ", 経度" + geo.lng.toFixed(4) + "付近。同一企業名・同一チェーン複数拠点は現在地に近い順でソートしてください。"
      : "現在地不明。日本の都市部を想定してください。";
    try {
      var parsed = await callClaude(makeCafeSystem(locHint), "目的地: " + query);
      setSrchResult(parsed);
      setActiveTab("exits");
      setHistory(function(prev) { return [{ query: query, dest: parsed.destination, ts: Date.now() }, ...prev.filter(function(h) { return h.query !== query; })].slice(0, 5); });
    } catch(e) {
      setSrchError("情報を取得できませんでした。再度お試しください。");
    }
    setSrchLoading(false);
  }, [destination, geo]);

  var handleNearby = useCallback(async function() {
    setNearLoading(true); setNearResult(null); setNearError(null);
    try {
      var g = geo;
      if (!g) g = await getGeo();
      var parsed = await callClaude(makeNearbySystem(g.lat.toFixed(5), g.lng.toFixed(5)), "現在地周辺の格安カフェを教えてください。緯度:" + g.lat.toFixed(5) + ", 経度:" + g.lng.toFixed(5));
      setNearResult(parsed);
    } catch(e) {
      setNearError(e.message === "denied" ? "位置情報の取得が許可されていません。" : "情報を取得できませんでした。");
    }
    setNearLoading(false);
  }, [geo, getGeo]);

  var isFav = srchResult && favorites.some(function(f) { return f.dest === srchResult.destination; });
  var toggleFav = function() {
    if (!srchResult) return;
    setFavorites(function(prev) {
      return isFav ? prev.filter(function(f) { return f.dest !== srchResult.destination; })
                   : [{ dest: srchResult.destination, query: destination, station: srchResult.nearestStation && srchResult.nearestStation.name, ts: Date.now() }, ...prev].slice(0, 20);
    });
  };

  var fmt = function(ts) { var d = new Date(ts); return (d.getMonth()+1) + "/" + d.getDate() + " " + d.getHours() + ":" + String(d.getMinutes()).padStart(2,"0"); };

  var bdr = "1px solid " + T.border;
  var card    = { background: T.surface, border: bdr, borderRadius: 10, padding: "14px" };
  var tag     = { display:"inline-block", background: T.tag, border: bdr, borderRadius:5, padding:"2px 8px", fontSize:11, color: T.accentSub };
  var mono    = { fontFamily:"'DM Mono','Courier New',monospace" };
  var closeBtn = { background:"none", border:"none", color:T.textMuted, fontSize:18, cursor:"pointer" };

  function iconBtn(active) {
    return { background: active ? T.surfaceAlt : "transparent", border: "1px solid " + (active ? T.borderHover : T.border), borderRadius:8, width:34, height:34, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color: active ? T.text : T.textMuted, fontSize:15, transition:"all 0.15s", flexShrink:0 };
  }
  function subTabBtn(active) {
    return { flex:1, background: active ? T.surfaceAlt : "transparent", border: "1px solid " + (active ? T.borderHover : T.border), borderRadius:7, padding:"8px 6px", color: active ? T.text : T.textMuted, fontSize:12, fontWeight: active ? 700 : 400, cursor:"pointer", letterSpacing:"0.04em", transition:"all 0.15s", fontFamily:"inherit" };
  }
  var sidePanel = { position:"fixed", top:0, right:0, width:280, height:"100vh", background:T.surface, borderLeft: bdr, zIndex:90, display:"flex", flexDirection:"column", overflowY:"auto" };
  var panelHead = { padding:"16px", borderBottom: bdr, display:"flex", alignItems:"center", justifyContent:"space-between" };

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, fontFamily:"'DM Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif", fontSize:14, display:"flex", flexDirection:"column" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;700&display=swap'); *{box-sizing:border-box;margin:0;padding:0;} ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:" + T.border + ";border-radius:2px;} @keyframes spin{to{transform:rotate(360deg);}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}} .fu{animation:fadeUp 0.22s ease both;}"}</style>

      <div style={{ background:T.surface, borderBottom: bdr, padding:"14px 16px", display:"flex", alignItems:"center", gap:10, position:"sticky", top:0, zIndex:50 }}>
        <div style={{ flex:1 }}>
          <div style={{ ...mono, fontSize:13, fontWeight:700, letterSpacing:"0.12em", color:T.highlight, textTransform:"uppercase" }}>StationCafe</div>
          <div style={{ fontSize:9, color:T.textMuted, letterSpacing:"0.2em", textTransform:"uppercase", marginTop:1 }}>Business Navigator</div>
        </div>
        {geo &&