import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Trophy, Shield, Users, Calendar, Radio, Settings, ChevronRight, ChevronLeft,
  Plus, Upload, Clock, MapPin, Award, AlertTriangle, CheckCircle2,
  Circle, Play, Pause, Menu, Target, LogOut, Lock, User, Trash2, Ban, Layers,
  Repeat, UserCheck, UserX, ClipboardList, Phone, Receipt, Printer, Star, Search
} from "lucide-react";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, deleteField, getDoc,
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { firebaseConfig } from "./firebase";
import ClassementPoster from "./ClassementPoster";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/* ---------------------------------------------------------
   TOKENS
--------------------------------------------------------- */

const COLORS = {
  pitch: "#0D2818",
  turf: "#1F6E43",
  chalk: "#F5F1E8",
  amber: "#F5A623",
  ink: "#14201A",
  line: "#DCD5C4",
};

const FIRST_NAMES = ["Karim","Yanis","Bilal","Omar","Sofiane","Rayan","Amine","Nabil","Farid","Idriss","Malik","Rachid","Hakim","Younes","Mehdi","Walid"];
const CITIES = ["Riverside","Montval","Belcourt","Nordhaven","Ambérieux","Castelnou","Vallière","Sainte-Rive"];
const TEAM_ROOTS = ["FC Riverside","AS Montval","Olympique Belcourt","US Nordhaven","Racing Ambérieux","Étoile Castelnou","FC Vallière","Sainte-Rive United"];

const ROLE_LABELS = {
  super_admin: "Super-Administrateur",
  admin: "Administrateur d'événement",
  superviseur: "Superviseur",
  arbitre: "Arbitre",
  president: "Président / Coach",
  joueur: "Joueur",
};
const EVENT_SCOPED_ROLES = ["superviseur", "arbitre", "president", "joueur"];
const PLAYERS_PER_TEAM = 16;
const STARTERS_COUNT = 11;

function initials(name) {
  return name.replace(/^(FC|AS|US|SC|Olympique|Racing|Étoile)\s+/i, "").trim().slice(0, 3).toUpperCase();
}
function personInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  const palette = ["#1F6E43", "#B4432B", "#2E4A7D", "#8A5A1E", "#5B3E8A", "#1E6E6E"];
  return palette[Math.abs(h) % palette.length];
}

function Badge({ name, logo, size = 40 }) {
  if (logo) return <img src={logo} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-white/80 shadow-sm shrink-0" />;
  return (
    <div style={{ width: size, height: size, background: hashColor(name), fontSize: size * 0.34 }} className="rounded-full flex items-center justify-center text-white font-bold shrink-0 border-2 border-white/80 shadow-sm tracking-tight">
      {initials(name)}
    </div>
  );
}

function PlayerAvatar({ name, photo, size = 36 }) {
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-white shadow-sm shrink-0" />;
  return (
    <div style={{ width: size, height: size, background: hashColor(name), fontSize: size * 0.32 }} className="rounded-full flex items-center justify-center text-white font-bold shrink-0 border-2 border-white shadow-sm">
      {personInitials(name)}
    </div>
  );
}

function makeTeam(id, name, city, licensePrefix = "TMP") {
  return {
    id, name, city, logo: null,
    players: Array.from({ length: PLAYERS_PER_TEAM }, (_, i) => ({
      id: `${id}-p${i}`,
      name: `${FIRST_NAMES[(id * 3 + i) % FIRST_NAMES.length]} ${String.fromCharCode(65 + ((id + i) % 26))}.`,
      number: i + 1,
      photo: null,
      weight: null,
      height: null,
      license: `${licensePrefix}-${String(id).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
    })),
  };
}

function defaultSettings(name) {
  return {
    name, win: 3, draw: 1, loss: 0, halfMinutes: 25, subs: 5, poolSize: 4,
    showPlayerProfiles: true, showTopScorers: true, manualDraw: false,
    suspensionRule: 2, allowTeamRemovalAfterLaunch: false, qualifiersPerPool: 2,
    requireTeamLogo: false, showScorerPhoto: true, showCaptainPhoto: true, publicAccess: true,
    cardValidity: "", cardHeader: "", cardOrientation: "horizontal", cardSizePreset: "86x54",
    cardBg: "#FFFFFF", cardBorder: "#1F6E43", cardPhotoPosition: "left",
  };
}

const CARD_SIZE_PRESETS = {
  "86x54": { w: 86, h: 54, label: "86 × 54 mm — carte bancaire" },
  "74x105": { w: 74, h: 105, label: "74 × 105 mm — format A7" },
  "100x150": { w: 100, h: 150, label: "100 × 150 mm — grand badge" },
};
const PAPER_SIZES = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };
const CARD_KIND_LABELS = { joueur: "Licence joueur", officiel: "Badge officiel", media: "Badge média" };

/* Carte unique (licence joueur / badge officiel / badge média), rendue à l'identique
   à l'écran et à l'impression, pilotée par la configuration visuelle de l'événement. */
function CardFace({ kind, name, subLabel, idValue, photo, headerText, validity, cfg }) {
  const preset = CARD_SIZE_PRESETS[cfg.cardSizePreset] || CARD_SIZE_PRESETS["86x54"];
  const vertical = cfg.cardOrientation === "vertical";
  const wMm = vertical ? Math.min(preset.w, preset.h) : Math.max(preset.w, preset.h);
  const hMm = vertical ? Math.max(preset.w, preset.h) : Math.min(preset.w, preset.h);
  const photoPos = cfg.cardPhotoPosition || "left";
  const idLabel = kind === "joueur" ? "N° licence" : "N° matricule";
  return (
    <div
      style={{
        width: `${wMm}mm`, height: `${hMm}mm`, background: cfg.cardBg || "#fff",
        border: `2px solid ${cfg.cardBorder || COLORS.turf}`, borderRadius: 6,
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: "'Inter', sans-serif", breakInside: "avoid", pageBreakInside: "avoid",
      }}
    >
      <div style={{ background: cfg.cardBorder || COLORS.turf, color: "#fff", padding: "4px 8px", fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {headerText}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: photoPos === "center" ? "column" : "row", alignItems: "center", justifyContent: photoPos === "center" ? "center" : "flex-start", gap: 8, padding: 8, ...(photoPos === "right" ? { flexDirection: "row-reverse" } : {}) }}>
        <PlayerAvatar name={name} photo={photo} size={photoPos === "center" ? 40 : 34} />
        <div style={{ minWidth: 0, textAlign: photoPos === "center" ? "center" : "left" }}>
          <div style={{ fontWeight: 900, fontSize: 11, color: COLORS.ink, lineHeight: 1.1 }}>{name}</div>
          {subLabel && <div style={{ fontSize: 8, color: "#8a8a80" }}>{subLabel}</div>}
          <div style={{ fontSize: 7, color: "#8a8a80", marginTop: 2 }}>{CARD_KIND_LABELS[kind]}</div>
        </div>
      </div>
      <div style={{ background: "#F5F1E8", padding: "3px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 6, textTransform: "uppercase", color: "#8a8a80" }}>{idLabel}</span>
        <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: 9, color: cfg.cardBorder || COLORS.turf }}>{idValue || "—"}</span>
      </div>
      {validity && <div style={{ fontSize: 6, textAlign: "center", color: "#8a8a80", padding: "1px 4px 3px" }}>Valide jusqu'au {validity}</div>}
    </div>
  );
}


const SLOTS = [
  { field: "Terrain A", time: "09:00" }, { field: "Terrain B", time: "09:00" },
  { field: "Terrain A", time: "10:15" }, { field: "Terrain B", time: "10:15" },
  { field: "Terrain A", time: "11:30" }, { field: "Terrain B", time: "11:30" },
  { field: "Terrain A", time: "13:00" }, { field: "Terrain B", time: "13:00" },
  { field: "Terrain A", time: "14:15" }, { field: "Terrain B", time: "14:15" },
  { field: "Terrain A", time: "15:30" }, { field: "Terrain B", time: "15:30" },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function roundRobinPairs(teamIds) {
  const pairs = [];
  for (let i = 0; i < teamIds.length; i++) for (let j = i + 1; j < teamIds.length; j++) pairs.push([teamIds[i], teamIds[j]]);
  return pairs;
}
function freshMatchState() {
  return { clock: { period: "pre", running: false, baseSeconds: 0, runningSince: null, addedFirst: 0, addedSecond: 0 }, lineups: {}, subRequests: [] };
}
function drawPoolsAndMatches(teams, poolSize, strategy = "balance") {
  const shuffled = shuffle(teams.map(t => t.id));
  const poolNames = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const pools = {};
  let leftover = [];

  if (strategy === "waitlist") {
    // Poules strictement complètes uniquement ; le reliquat part en liste d'attente (non assigné).
    const nFull = Math.floor(shuffled.length / poolSize);
    for (let i = 0; i < nFull; i++) pools[poolNames[i]] = shuffled.slice(i * poolSize, (i + 1) * poolSize);
    leftover = shuffled.slice(nFull * poolSize);
  } else if (strategy === "newPool") {
    // Découpage séquentiel strict par paquets de poolSize ; le dernier paquet forme sa propre poule, même réduite.
    const nPools = Math.max(1, Math.ceil(shuffled.length / poolSize));
    for (let i = 0; i < nPools; i++) pools[poolNames[i]] = shuffled.slice(i * poolSize, (i + 1) * poolSize);
  } else {
    // "balance" (défaut) : répartition round-robin qui équilibre le reliquat sur les poules existantes.
    const nPools = Math.max(1, Math.ceil(shuffled.length / poolSize));
    for (let i = 0; i < nPools; i++) pools[poolNames[i]] = [];
    shuffled.forEach((id, i) => pools[poolNames[i % nPools]].push(id));
  }

  const matches = poolMatchesFromPools(pools);
  return { pools, matches, leftover };
}
/* (Re)génère les matchs de round-robin pour un ensemble de poules, en repartant du premier créneau —
   utilisé au tirage initial ET lors d'un réajustement manuel de poule. */
function poolMatchesFromPools(pools) {
  let slotCursor = 0;
  const matches = [];
  Object.entries(pools).forEach(([poolName, ids]) => {
    roundRobinPairs(ids).forEach(([home, away]) => {
      const slot = SLOTS[slotCursor % SLOTS.length];
      matches.push({
        id: `${poolName}-${home}-${away}`, pool: poolName, home, away,
        field: slot.field, time: slot.time, status: "scheduled",
        homeScore: 0, awayScore: 0, events: [],
        clock: { period: "pre", running: false, baseSeconds: 0, runningSince: null, addedFirst: 0, addedSecond: 0 },
        lineups: { [home]: { starters: [], bench: [], validated: false }, [away]: { starters: [], bench: [], validated: false } },
        subRequests: [],
        slot: slotCursor,
      });
      slotCursor++;
    });
  });
  return matches;
}

function liveSeconds(clock) {
  if (!clock) return 0;
  const base = clock.baseSeconds || 0;
  if (clock.running && clock.runningSince) return base + (Date.now() - clock.runningSince) / 1000;
  return base;
}
function clockMinuteLabel(clock) {
  if (!clock) return "";
  const mins = Math.floor(liveSeconds(clock) / 60);
  if (clock.period === "pre") return "Avant-match";
  if (clock.period === "half") return "Mi-temps";
  if (clock.period === "done") return "Terminé";
  if (clock.period === "first") return mins > 45 ? `45+${mins - 45}'` : `${mins}'`;
  if (clock.period === "second") return mins > 45 ? `90+${mins - 45}'` : `${45 + mins}'`;
  return "";
}

function onFieldPlayers(match, teamId, team) {
  const lineup = match.lineups?.[teamId];
  if (!lineup || !lineup.starters?.length) return [];
  let field = [...lineup.starters];
  (match.events || []).filter(e => e.type === "substitution" && e.teamId === teamId).forEach(e => {
    field = field.filter(id => id !== e.outPlayerId).concat(e.inPlayerId);
  });
  return field.map(id => team.players.find(p => p.id === id)).filter(Boolean);
}

const ROUND_NAMES_BY_SIZE = { 2: ["Finale"], 4: ["Demi-finale", "Finale"], 8: ["Quart de finale", "Demi-finale", "Finale"], 16: ["Huitième de finale", "Quart de finale", "Demi-finale", "Finale"], 32: ["Seizième de finale", "Huitième de finale", "Quart de finale", "Demi-finale", "Finale"] };
function roundNamesForSize(size) { return ROUND_NAMES_BY_SIZE[size] || Array.from({ length: Math.log2(size) }, (_, i) => `Tour ${i + 1}`); }
function nextPowerOf2(n) { let p = 1; while (p < n) p *= 2; return p; }
function bracketPairIndices(size) {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const s = seeds.length * 2 + 1;
    const next = [];
    seeds.forEach(seed => { next.push(seed); next.push(s - seed); });
    seeds = next;
  }
  const pairs = [];
  for (let i = 0; i < seeds.length; i += 2) pairs.push([seeds[i] - 1, seeds[i + 1] - 1]);
  return pairs;
}
function bracketWinnerOf(m) {
  if (!m || m.status !== "done") return null;
  if (m.home == null) return m.away;
  if (m.away == null) return m.home;
  if (m.penaltyWinner) return m.penaltyWinner;
  if (m.homeScore === m.awayScore) return null;
  return m.homeScore > m.awayScore ? m.home : m.away;
}
function emptyBracketClock() { return { period: "pre", running: false, baseSeconds: 0, runningSince: null, addedFirst: 0, addedSecond: 0 }; }
function generateBracket(ev) {
  if (!ev.pools) return null;
  const qualifiersPerPool = ev.settings.qualifiersPerPool || 2;
  const standings = computeStandingsForEvent(ev);
  const poolNames = Object.keys(ev.pools).sort();
  const seedList = [];
  for (let rank = 0; rank < qualifiersPerPool; rank++) {
    poolNames.forEach(poolName => {
      const table = standings[poolName];
      if (table && table[rank]) seedList.push({ teamId: table[rank].id, label: `${rank + 1}${rank === 0 ? "er" : "e"} Poule ${poolName}` });
    });
  }
  if (seedList.length < 2) return null;
  const size = nextPowerOf2(seedList.length);
  const pairs = bracketPairIndices(size);
  const round1 = pairs.map(([a, b], i) => {
    const teamA = seedList[a]?.teamId ?? null;
    const teamB = seedList[b]?.teamId ?? null;
    const isBye = (teamA && !teamB) || (!teamA && teamB);
    return {
      id: `bracket-r0-m${i}`, round: 0, home: teamA, away: teamB,
      homeLabel: seedList[a]?.label || null, awayLabel: seedList[b]?.label || null,
      field: "Terrain A", time: "à définir", status: isBye ? "done" : "scheduled",
      homeScore: isBye && teamA ? 1 : 0, awayScore: isBye && teamB ? 1 : 0,
      events: [], clock: emptyBracketClock(), lineups: {}, subRequests: [],
    };
  });
  const rounds = [round1];
  let prev = round1;
  for (let r = 1; r < Math.log2(size); r++) {
    const round = [];
    for (let i = 0; i < prev.length; i += 2) {
      round.push({
        id: `bracket-r${r}-m${i / 2}`, round: r, home: null, away: null,
        homeSourceMatchId: prev[i].id, awaySourceMatchId: prev[i + 1].id,
        field: "Terrain A", time: "à définir", status: "scheduled",
        homeScore: 0, awayScore: 0, events: [], clock: emptyBracketClock(), lineups: {}, subRequests: [],
      });
    }
    rounds.push(round);
    prev = round;
  }
  return propagateBracketWinners({ rounds, roundNames: roundNamesForSize(size) });
}
function propagateBracketWinners(bracket) {
  if (!bracket) return bracket;
  const all = bracket.rounds.flat();
  const byId = Object.fromEntries(all.map(m => [m.id, m]));
  const rounds = bracket.rounds.map((round, ri) => round.map(m => {
    if (ri === 0) return m;
    const w1 = m.home ?? bracketWinnerOf(byId[m.homeSourceMatchId]);
    const w2 = m.away ?? bracketWinnerOf(byId[m.awaySourceMatchId]);
    return { ...m, home: m.home ?? w1, away: m.away ?? w2 };
  }));
  return { ...bracket, rounds };
}

function computeStandingsForEvent(ev) {
  if (!ev.pools) return {};
  const teamById = Object.fromEntries(ev.teams.map(t => [t.id, t]));
  const out = {};
  Object.entries(ev.pools).forEach(([poolName, ids]) => {
    const validIds = ids.filter(id => teamById[id]);
    const table = Object.fromEntries(validIds.map(id => [id, { id, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }]));
    ev.matches.filter(m => m.pool === poolName && m.status === "done" && table[m.home] && table[m.away]).forEach(m => {
      const h = table[m.home], a = table[m.away];
      h.played++; a.played++;
      h.gf += m.homeScore; h.ga += m.awayScore; a.gf += m.awayScore; a.ga += m.homeScore;
      if (m.homeScore > m.awayScore) { h.w++; a.l++; h.pts += ev.settings.win; a.pts += ev.settings.loss; }
      else if (m.homeScore < m.awayScore) { a.w++; h.l++; a.pts += ev.settings.win; h.pts += ev.settings.loss; }
      else { h.d++; a.d++; h.pts += ev.settings.draw; a.pts += ev.settings.draw; }
    });
    out[poolName] = Object.values(table).sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
  });
  return out;
}
function computeTopScorersForEvent(ev) {
  const tally = {};
  ev.matches.forEach(m => (m.events || []).forEach(e => {
    if (e.type !== "goal") return;
    tally[e.playerId] = tally[e.playerId] || { playerId: e.playerId, playerName: e.playerName, teamId: e.teamId, goals: 0 };
    tally[e.playerId].goals++;
  }));
  return Object.values(tally).sort((a, b) => b.goals - a.goals).slice(0, 8);
}
function computeSuspendedForEvent(ev) {
  const yellows = {};
  const out = [];
  ev.matches.forEach(m => (m.events || []).forEach(e => {
    if (e.type === "yellow") {
      yellows[e.playerId] = (yellows[e.playerId] || 0) + 1;
      if (yellows[e.playerId] === ev.settings.suspensionRule) out.push({ playerId: e.playerId, playerName: e.playerName, teamId: e.teamId, reason: `${ev.settings.suspensionRule} cartons jaunes` });
    }
    if (e.type === "red") out.push({ playerId: e.playerId, playerName: e.playerName, teamId: e.teamId, reason: e.auto ? "2e carton jaune (expulsion)" : "carton rouge" });
  }));
  return out;
}

/* ---------- presentational panels (module-level, props only) ---------- */

function MatchClock({ clock }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!clock.running) return;
    const t = setInterval(() => forceTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [clock.running, clock.runningSince]);
  const total = Math.floor(liveSeconds(clock));
  const mins = Math.floor(total / 60), secs = total % 60;
  const label = clock.period === "pre" ? "Avant-match" : clock.period === "half" ? "Mi-temps" : clock.period === "done" ? "Terminé" : clock.period === "first" ? "1ère période" : "2e période";
  return (
    <div className="flex items-center gap-3">
      <div className="font-mono font-black text-2xl px-3 py-1.5 rounded-lg tabular-nums" style={{ background: COLORS.pitch, color: COLORS.amber }}>
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </div>
      <div>
        <div className="text-xs font-bold uppercase" style={{ color: COLORS.turf }}>{label}</div>
        {clock.period === "first" && clock.addedFirst > 0 && <div className="text-[10px] text-stone-400">+{clock.addedFirst}' arrêt de jeu signalé</div>}
        {clock.period === "second" && clock.addedSecond > 0 && <div className="text-[10px] text-stone-400">+{clock.addedSecond}' arrêt de jeu signalé</div>}
      </div>
    </div>
  );
}

function LiveMatchHero({ ev }) {
  const tb = Object.fromEntries(ev.teams.map(t => [t.id, t]));
  const live = ev.matches.filter(m => m.status === "live");
  if (!live.length) return null;
  return (
    <div className="space-y-3 mb-6">
      {live.map(m => {
        const home = tb[m.home], away = tb[m.away];
        if (!home || !away) return null;
        const evts = m.events || [];
        const goalsHome = evts.filter(e => e.type === "goal" && e.teamId === m.home);
        const goalsAway = evts.filter(e => e.type === "goal" && e.teamId === m.away);
        const yellowHome = evts.filter(e => e.type === "yellow" && e.teamId === m.home).length;
        const yellowAway = evts.filter(e => e.type === "yellow" && e.teamId === m.away).length;
        const redHome = evts.filter(e => e.type === "red" && e.teamId === m.home).length;
        const redAway = evts.filter(e => e.type === "red" && e.teamId === m.away).length;
        return (
          <div key={m.id} className="bg-white rounded-2xl border-2 p-5" style={{ borderColor: COLORS.amber }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase" style={{ color: COLORS.amber }}>
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: COLORS.amber }} /><span className="relative inline-flex rounded-full h-2 w-2" style={{ background: COLORS.amber }} /></span>
                Match en direct · Poule {m.pool}
              </span>
              <MatchClock clock={m.clock} />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4 mb-4">
              <div className="flex flex-col items-center gap-2 text-center min-w-0"><Badge name={home.name} logo={home.logo} size={44} /><span className="font-bold text-sm truncate w-full">{home.name}</span></div>
              <div className="font-mono font-black text-3xl sm:text-4xl tabular-nums px-3 sm:px-4 py-2 rounded-xl" style={{ background: COLORS.pitch, color: COLORS.amber }}>{m.homeScore} – {m.awayScore}</div>
              <div className="flex flex-col items-center gap-2 text-center min-w-0"><Badge name={away.name} logo={away.logo} size={44} /><span className="font-bold text-sm truncate w-full">{away.name}</span></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-t pt-4" style={{ borderColor: COLORS.line }}>
              <div>
                <div className="text-[11px] font-semibold uppercase text-stone-400 mb-1.5">Buteurs {home.name}</div>
                {goalsHome.length === 0 ? <p className="text-xs text-stone-400">Aucun but</p> : goalsHome.map((s, i) => <div key={i} className="flex items-center gap-1.5"><Target size={12} style={{ color: COLORS.turf }} />{s.playerName}<span className="text-stone-400 text-xs">{s.minuteLabel}</span></div>)}
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase text-stone-400 mb-1.5">Buteurs {away.name}</div>
                {goalsAway.length === 0 ? <p className="text-xs text-stone-400">Aucun but</p> : goalsAway.map((s, i) => <div key={i} className="flex items-center gap-1.5"><Target size={12} style={{ color: COLORS.turf }} />{s.playerName}<span className="text-stone-400 text-xs">{s.minuteLabel}</span></div>)}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-stone-500 mt-3 pt-3 border-t" style={{ borderColor: COLORS.line }}>
              <span className="flex items-center gap-1"><div className="w-2 h-3 rounded-sm bg-yellow-400" />{yellowHome} — {yellowAway}</span>
              <span className="flex items-center gap-1"><div className="w-2 h-3 rounded-sm bg-red-600" />{redHome} — {redAway}</span>
              <span>{m.field}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineupValidationPanel({ home, away, homeId, awayId, homeLineup, awayLineup, onValidate }) {
  const rows = [[home, homeId, homeLineup], [away, awayId, awayLineup]];
  return (
    <div className="bg-white rounded-2xl border p-5 mb-5" style={{ borderColor: COLORS.line }}>
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3">Compositions avant coup d'envoi</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rows.map(([team, teamId, lineup]) => (
          <div key={teamId} className="border rounded-xl p-3" style={{ borderColor: COLORS.line }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><Badge name={team.name} logo={team.logo} size={24} /><span className="font-bold text-sm">{team.name}</span></div>
              {lineup.validated ? (
                <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={12} />Validée</span>
              ) : lineup.starters.length === 0 ? (
                <span className="text-[10px] text-stone-400">En attente du coach</span>
              ) : (
                <span className="text-[10px] text-amber-700 font-bold">À valider</span>
              )}
            </div>
            <div className="text-xs text-stone-500 mb-2">{lineup.starters.length > 0 ? `${lineup.starters.length} titulaires soumis` : "Composition non soumise"}</div>
            {!lineup.validated && lineup.starters.length > 0 && (
              <button onClick={() => onValidate(teamId)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: COLORS.turf }}>Valider la composition</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SubstitutionRequestsPanel({ pending, teamById, onRespond }) {
  if (!pending.length) return null;
  return (
    <div className="bg-white rounded-xl border-2 p-4 mb-4" style={{ borderColor: COLORS.amber }}>
      <div className="text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: COLORS.amber }}><Repeat size={13} />Remplacements à valider</div>
      {pending.map(r => (
        <div key={r.id} className="flex items-center justify-between py-1.5 text-sm">
          <span>{teamById[r.teamId]?.name} — <span className="text-red-700">{r.outName}</span> ➜ <span className="text-emerald-700">{r.inName}</span></span>
          <div className="flex gap-3">
            <button onClick={() => onRespond(r.id, "validated")} className="text-emerald-700 hover:opacity-70" title="Valider"><UserCheck size={16} /></button>
            <button onClick={() => onRespond(r.id, "rejected")} className="text-red-700 hover:opacity-70" title="Refuser"><UserX size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ modal, onClose }) {
  const [typed, setTyped] = useState("");
  if (!modal) return null;
  const isDelete = modal.kind === "delete";
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        {isDelete ? (
          <>
            <div className="flex items-center gap-2 mb-2"><Ban size={18} style={{ color: "#B4432B" }} /><h3 className="font-black text-lg" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Suppression définitive</h3></div>
            <p className="text-sm text-stone-600 mb-4">Vous êtes sur le point de supprimer <strong>{modal.title}</strong>. Cette action est irréversible. Tapez <strong>SUPPRIMER</strong> ci-dessous pour confirmer.</p>
            <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="SUPPRIMER" className="w-full border rounded-lg px-3 py-2 text-sm mb-4 outline-none" style={{ borderColor: COLORS.line }} autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-500">Annuler</button>
              <button
                onClick={() => { if (typed.trim().toUpperCase() === "SUPPRIMER") { modal.onConfirm(); onClose(); } }}
                disabled={typed.trim().toUpperCase() !== "SUPPRIMER"}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40"
                style={{ background: "#B4432B" }}
              >
                Supprimer définitivement
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-black text-lg mb-1" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Vérifiez avant d'enregistrer</h3>
            <p className="text-xs text-stone-500 mb-4">{modal.title}</p>
            <div className="bg-stone-50 rounded-lg divide-y mb-5" style={{ borderColor: COLORS.line }}>
              {(modal.summary || []).map((row, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-stone-500">{row.label}</span>
                  <span className="font-semibold text-right" style={{ color: COLORS.ink }}>{row.value || "—"}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-500">Modifier</button>
              <button onClick={() => { modal.onConfirm(); onClose(); }} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLORS.turf }}>
                {modal.confirmLabel || "Confirmer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LicenseCardModal({ view, eventName, onClose }) {
  if (!view) return null;
  const { team, player } = view;
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 no-print">
          <h3 className="font-black text-lg" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Carte de licence</h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: COLORS.turf }}><Printer size={13} />Imprimer</button>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-sm font-semibold">Fermer</button>
          </div>
        </div>
        <div className="print-area rounded-2xl overflow-hidden border" style={{ borderColor: COLORS.line }}>
          <div style={{ background: COLORS.pitch }} className="p-4 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: COLORS.amber }}><Trophy size={14} style={{ color: COLORS.pitch }} /></div>
            <div className="text-white text-xs font-black uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{eventName}</div>
          </div>
          <div className="p-5 flex gap-4 items-center bg-white">
            <PlayerAvatar name={player.name} photo={player.photo} size={72} />
            <div className="min-w-0">
              <div className="font-black text-lg leading-tight" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>{player.name}</div>
              <div className="text-sm text-stone-500 flex items-center gap-1.5"><Badge name={team.name} logo={team.logo} size={16} />{team.name}</div>
              <div className="text-xs text-stone-400 mt-1">N° {player.number}{player.weight ? ` · ${player.weight} kg` : ""}{player.height ? ` · ${player.height} cm` : ""}</div>
            </div>
          </div>
          <div className="px-5 pb-4 pt-2 flex items-center justify-between" style={{ background: COLORS.chalk }}>
            <span className="text-[10px] uppercase tracking-wide text-stone-400">N° licence</span>
            <span className="font-mono font-bold text-sm" style={{ color: COLORS.turf }}>{player.license || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamLicensesModal({ team, eventName, onOpenPlayer, onClose }) {
  if (!team) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><Badge name={team.name} logo={team.logo} size={28} /><h3 className="font-black text-lg" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Licences — {team.name}</h3></div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-sm font-semibold">Fermer</button>
        </div>
        <div className="space-y-1.5">
          {team.players.map(p => (
            <button key={p.id} onClick={() => onOpenPlayer(p)} className="w-full flex items-center gap-3 p-2 rounded-lg border hover:bg-stone-50 text-left" style={{ borderColor: COLORS.line }}>
              <PlayerAvatar name={p.name} photo={p.photo} size={30} />
              <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{p.name}</div><div className="text-xs text-stone-400">#{p.number}</div></div>
              <span className="font-mono text-xs px-2 py-1 rounded" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>{p.license || "—"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const NAV = [
  { id: "setup", label: "Configuration", icon: Settings, roles: ["super_admin", "admin"] },
  { id: "events", label: "Mes événements", icon: Layers, roles: ["super_admin", "admin"] },
  { id: "users", label: "Utilisateurs & rôles", icon: Users, roles: ["super_admin", "admin"] },
  { id: "teams", label: "Équipes", icon: Shield, roles: ["super_admin", "admin", "president"] },
  { id: "coach_match", label: "Mes matchs", icon: ClipboardList, roles: ["president"] },
  { id: "draw", label: "Tirage & Calendrier", icon: Calendar, roles: ["super_admin", "admin", "superviseur"] },
  { id: "referee", label: "Feuille de match", icon: Shield, roles: ["super_admin", "admin", "superviseur", "arbitre"] },
  { id: "live", label: "Dashboard public", icon: Radio, roles: ["super_admin", "admin", "superviseur", "arbitre", "president", "joueur"] },
  { id: "refunds", label: "Remboursements", icon: Receipt, roles: ["super_admin", "admin", "president"] },
  { id: "search", label: "Recherche", icon: Search, roles: ["super_admin", "admin", "superviseur", "arbitre"] },
  { id: "cards", label: "Cartes & Licences", icon: Award, roles: ["super_admin", "admin", "superviseur"] },
  { id: "profile", label: "Mon profil", icon: User, roles: ["joueur"] },
];

const EMPTY_EVENT = { id: null, settings: defaultSettings(""), teams: [], pools: null, matches: [], refundRequests: [], bracket: null };

/* Creates a Firebase Auth user WITHOUT signing the caller out of their own session,
   using a throwaway secondary app instance. Purely client-side — no Cloud Function needed. */
async function createAuthUserWithoutSignIn(email, password) {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    await signOut(secondaryAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondary);
  }
}

const AUTH_ERROR_MESSAGES = {
  "auth/invalid-email": "Adresse e-mail invalide.",
  "auth/user-not-found": "Aucun compte avec cet e-mail.",
  "auth/wrong-password": "Mot de passe incorrect.",
  "auth/invalid-credential": "Identifiants invalides.",
  "auth/too-many-requests": "Trop de tentatives — réessayez dans quelques minutes.",
  "auth/email-already-in-use": "Cet e-mail est déjà utilisé par un autre compte.",
  "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
};

/* Normalise un identifiant (nom d'utilisateur, téléphone, ID profil) pour qu'il corresponde
   toujours au même document dans loginLookup, quelle que soit la casse ou les espaces tapés. */
function normalizeIdentifier(str) {
  return (str || "").trim().toLowerCase().replace(/\s+/g, "");
}

/* Résout n'importe quel identifiant (e-mail, nom d'utilisateur, téléphone, ID profil) vers
   une vraie adresse e-mail Firebase Auth, via la collection publique loginLookup. */
async function resolveLoginEmail(identifier) {
  const raw = (identifier || "").trim();
  if (raw.includes("@")) return raw.toLowerCase();
  const norm = normalizeIdentifier(raw);
  if (!norm) return null;
  try {
    const snap = await getDoc(doc(db, "loginLookup", norm));
    return snap.exists() ? snap.data().email : null;
  } catch {
    return null;
  }
}

function LoginScreen({ loginForm, setLoginForm, onSubmit, onViewPublic }) {
  return (
    <div className="min-h-screen w-full flex" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="hidden lg:flex flex-col justify-between w-[42%] p-12" style={{ background: COLORS.pitch }}>
        <div className="flex items-center gap-2.5"><div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: COLORS.amber }}><Trophy size={18} style={{ color: COLORS.pitch }} /></div><div className="text-white font-black text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>TourneyOS</div></div>
        <div><h1 className="text-white text-4xl font-black leading-tight mb-3" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Le direct,<br />piloté par<br />l'arbitre.</h1>
          <p className="text-white/50 text-sm max-w-sm">Chrono, compositions validées, remplacements en temps réel — tout part de la feuille de match officielle.</p></div>
        <div className="text-white/30 text-xs">© 2026 TourneyOS</div>
      </div>
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: COLORS.chalk }}>
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: COLORS.amber }}><Trophy size={16} style={{ color: COLORS.pitch }} /></div><div className="font-black text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>TourneyOS</div></div>
          <h2 className="text-xl font-black mb-1" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Connexion</h2>
          <p className="text-sm text-stone-500 mb-6">Connectez-vous pour accéder à votre espace.</p>
          <form onSubmit={onSubmit} autoComplete="off" className="bg-white rounded-2xl border p-6 mb-5" style={{ borderColor: COLORS.line }}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Identifiant</label>
            <input type="text" name="tourneyos-identifiant" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value, error: "" }))} placeholder="E-mail, nom d'utilisateur, téléphone ou ID profil" className="w-full border rounded-lg px-3 py-2 mb-4 outline-none" style={{ borderColor: COLORS.line }} autoFocus />
            <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Mot de passe</label>
            <input type="password" name="tourneyos-secret" autoComplete="new-password" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value, error: "" }))} placeholder="••••••••" className="w-full border rounded-lg px-3 py-2 mb-1 outline-none" style={{ borderColor: COLORS.line }} />
            {loginForm.error && <p className="text-xs text-red-700 mt-2">{loginForm.error}</p>}
            <button type="submit" className="w-full mt-4 py-2.5 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2" style={{ background: COLORS.pitch }}><Lock size={14} />Se connecter</button>
          </form>
          <p className="text-[11px] text-stone-400">Identifiants oubliés ? Contactez l'administrateur de votre tournoi.</p>
          {onViewPublic && (
            <button onClick={onViewPublic} className="w-full mt-4 text-center text-xs font-semibold py-2.5 rounded-lg border" style={{ borderColor: COLORS.line, color: COLORS.turf }}>
              Voir les résultats publics sans se connecter →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TourneyOS() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "", error: "" });
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [managingEventId, setManagingEventId] = useState(null);
  const [view, setView] = useState("setup");
  const [navOpen, setNavOpen] = useState(false);
  const [refereeMatchId, setRefereeMatchId] = useState(null);
  const [dashboardEventId, setDashboardEventId] = useState(null);
  const [dashboardTab, setDashboardTab] = useState("programme");
  const fileRef = useRef(null);
  const [newTeam, setNewTeam] = useState({ name: "", city: "", logo: null, coachName: "", coachPhone: "" });
  const [newAccount, setNewAccount] = useState({ name: "", email: "", username: "", phone: "", role: "arbitre", teamId: "", playerId: "", password: "", canAuthorize: false });
  const [newEventName, setNewEventName] = useState("");
  const [configDraft, setConfigDraft] = useState(null); // brouillon local de Configuration, null = pas de modification en attente
  const [configSaved, setConfigSaved] = useState(false);
  useEffect(() => { setConfigDraft(null); setConfigSaved(false); }, [managingEventId]);
  const [cardConfigDraft, setCardConfigDraft] = useState(null);
  const [cardConfigSaved, setCardConfigSaved] = useState(false);
  useEffect(() => { setCardConfigDraft(null); setCardConfigSaved(false); }, [managingEventId]);
  const [selectedCardIds, setSelectedCardIds] = useState({}); // { "cardKey": true }
  const [printPaper, setPrintPaper] = useState("A4");
  const [printMargin, setPrintMargin] = useState(10);
  const [printGap, setPrintGap] = useState(4);
  const [printingCards, setPrintingCards] = useState(false);
  const [newOfficial, setNewOfficial] = useState({ teamId: "", name: "", role: "" });
  const [newMedia, setNewMedia] = useState({ name: "", org: "", role: "" });
  const [drawStrategy, setDrawStrategy] = useState("balance");
  const [eventError, setEventError] = useState("");
  const [publicMode, setPublicMode] = useState(false);
  const [licenseView, setLicenseView] = useState(null); // { team, player }
  const [teamLicensesView, setTeamLicensesView] = useState(null); // team
  const [searchQuery, setSearchQuery] = useState("");
  const [justCreated, setJustCreated] = useState(null); // { email, password } — shown once after account creation
  const [confirmModal, setConfirmModal] = useState(null); // { kind:'delete'|'save', title, summary?, confirmLabel?, onConfirm }
  function askDeleteConfirm(title, onConfirm) { setConfirmModal({ kind: "delete", title, onConfirm }); }
  function askSaveConfirm(title, summary, onConfirm, confirmLabel = "Confirmer") { setConfirmModal({ kind: "save", title, summary, onConfirm, confirmLabel }); }
  const [accountError, setAccountError] = useState("");

  /* Firebase Auth session */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setFirebaseUser(u); setAuthChecked(true); });
    return unsub;
  }, []);

  /* Load this user's profile (role, eventId, teamId...) from Firestore once signed in */
  useEffect(() => {
    if (!firebaseUser) { setCurrentUser(null); setProfileMissing(false); return; }
    const unsub = onSnapshot(doc(db, "users", firebaseUser.uid), snap => {
      if (snap.exists()) { setCurrentUser({ id: firebaseUser.uid, ...snap.data() }); setProfileMissing(false); }
      else { setCurrentUser(null); setProfileMissing(true); }
    });
    return unsub;
  }, [firebaseUser]);

  /* Real-time sync: every event document, shared across all connected users */
  const [eventsListenerError, setEventsListenerError] = useState("");
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "events"),
      snap => { setEventsListenerError(""); setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      err => { console.error("Échec de lecture Firestore (events) :", err); setEventsListenerError(err.message || String(err)); }
    );
    return unsub;
  }, []);

  /* Real-time sync: user directory (only meaningfully readable by admins/ayants droit — see firestore.rules) */
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => { /* not authorized to list all users — fine for non-admin roles */ });
    return unsub;
  }, [currentUser?.id]);

  /* Les admins/super-admins n'entrent plus automatiquement dans un événement à la connexion :
     "Mes événements" est la page d'accueil globale, et il faut ouvrir un événement explicitement
     pour accéder à son espace de gestion dédié (Configuration, Équipes, Cartes, Tirage...). */

  const activeEventId = (currentUser?.role === "admin" || currentUser?.role === "super_admin") ? managingEventId : currentUser?.eventId;
  const activeEvent = events.find(e => e.id === activeEventId) || EMPTY_EVENT;
  const managingEvent = events.find(e => e.id === managingEventId) || EMPTY_EVENT;
  const settings = activeEvent.settings;
  const teams = activeEvent.teams;
  const pools = activeEvent.pools;
  const matches = activeEvent.matches;
  const bracket = activeEvent.bracket;
  const poolLeftovers = activeEvent.poolLeftovers || [];
  const tournamentLaunched = pools !== null;


  const teamById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams]);
  const isFullAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  /* Isolation multi-comités : un Administrateur d'événement (organisateur) ne voit et ne gère que
     les événements QU'IL a créés — jamais ceux d'un autre comité d'organisation. Seul le
     Super-Administrateur a une vue et un droit de regard sur l'ensemble du système. */
  const myEvents = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "super_admin") return events;
    if (currentUser.role === "admin") return events.filter(e => e.createdBy === currentUser.id);
    return events;
  }, [events, currentUser]);
  const myEventIds = useMemo(() => new Set(myEvents.map(e => e.id)), [myEvents]);
  const allowedNav = useMemo(() => {
    if (!currentUser) return [];
    const canAuthorizeExtras = ["users", "refunds", "cards", "setup", "teams"];
    let nav = NAV.filter(n => n.roles.includes(currentUser.role) || (currentUser.canAuthorize && canAuthorizeExtras.includes(n.id)));
    // Page d'accueil globale pour les admins/super-admins : tant qu'aucun événement n'est ouvert,
    // seuls "Mes événements" (pour en choisir/créer un) et "Recherche" (transverse) sont accessibles —
    // les équipes, joueurs, cartes, utilisateurs, etc. n'existent que DANS un événement ouvert.
    if (isFullAdmin && !managingEventId) nav = nav.filter(n => n.id === "events" || n.id === "search");
    return nav;
  }, [currentUser, managingEventId, isFullAdmin]);

  useEffect(() => {
    if (!currentUser) return;
    const firstAllowed = NAV.find(n => n.roles.includes(currentUser.role));
    setView(firstAllowed ? firstAllowed.id : "live");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  function updateEvent(id, updater) {
    if (!id) return;
    const current = events.find(e => e.id === id);
    if (!current) return;
    const next = updater(current);
    const { id: _drop, ...data } = next;
    setDoc(doc(db, "events", id), data).catch(err => console.error("Échec de l'écriture Firestore (events):", err));
  }
  function patchSettings(patch) { updateEvent(activeEventId, e => ({ ...e, settings: { ...e.settings, ...patch } })); }
  function updateMatch(matchId, updater) {
    updateEvent(activeEventId, e => {
      const inPool = e.matches.some(m => m.id === matchId);
      if (inPool) {
        const matches = e.matches.map(m => m.id === matchId ? updater(m) : m);
        let bracket = e.bracket;
        if (!bracket && matches.length > 0 && matches.every(m => m.status === "done")) bracket = generateBracket({ ...e, matches });
        return { ...e, matches, bracket };
      }
      if (e.bracket) {
        const rounds = e.bracket.rounds.map(round => round.map(m => m.id === matchId ? updater(m) : m));
        return { ...e, bracket: propagateBracketWinners({ ...e.bracket, rounds }) };
      }
      return e;
    });
  }

  /* ---------- auth ---------- */
  async function handleLogin(e) {
    e?.preventDefault();
    if (!loginForm.email.trim() || !loginForm.password) { setLoginForm({ ...loginForm, error: "Identifiant et mot de passe requis." }); return; }
    const resolvedEmail = await resolveLoginEmail(loginForm.email);
    if (!resolvedEmail) { setLoginForm({ ...loginForm, error: "Identifiant introuvable." }); return; }
    signInWithEmailAndPassword(auth, resolvedEmail, loginForm.password)
      .then(() => { setLoginForm({ email: "", password: "", error: "" }); setView("setup"); })
      .catch(err => setLoginForm({ ...loginForm, error: AUTH_ERROR_MESSAGES[err.code] || "Connexion impossible. Réessayez." }));
  }
  function logout() { signOut(auth); setNavOpen(false); setDashboardEventId(null); }

  /* ---------- teams ---------- */
  function handleLogoFile(e, cb) {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `uploads/${activeEventId || "misc"}/${Date.now()}-${file.name}`;
    const ref = storageRef(storage, path);
    uploadBytes(ref, file)
      .then(() => getDownloadURL(ref))
      .then(url => cb(url))
      .catch(err => console.error("Échec de l'upload (Storage):", err));
  }
  function addTeam() {
    if (!newTeam.name.trim()) return;
    updateEvent(activeEventId, e => {
      const id = e.teams.length ? Math.max(...e.teams.map(t => t.id)) + 1 : 0;
      const licensePrefix = (e.settings.name || "TMP").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "TMP";
      const t = { ...makeTeam(id, newTeam.name.trim(), newTeam.city.trim() || "—", licensePrefix), logo: newTeam.logo, coachName: newTeam.coachName.trim(), coachPhone: newTeam.coachPhone.trim(), officials: [] };
      if (currentUser.role === "president" && currentUser.teamId === undefined) {
        updateDoc(doc(db, "users", currentUser.id), { teamId: id }).catch(err => console.error("Échec de la mise à jour du profil:", err));
      }
      return { ...e, teams: [...e.teams, t] };
    });
    setNewTeam({ name: "", city: "", logo: null, coachName: "", coachPhone: "" });
  }
  function removeTeam(id) {
    if (tournamentLaunched && !settings.allowTeamRemovalAfterLaunch) return;
    updateEvent(activeEventId, e => {
      const nextTeams = e.teams.filter(t => t.id !== id);
      if (!e.pools) return { ...e, teams: nextTeams };
      const nextPools = {};
      Object.entries(e.pools).forEach(([k, ids]) => { nextPools[k] = ids.filter(i => i !== id); });
      const nextMatches = e.matches.filter(m => m.home !== id && m.away !== id);
      return { ...e, teams: nextTeams, pools: nextPools, matches: nextMatches };
    });
  }
  function updatePlayerPhoto(teamId, playerId, photo) {
    updateEvent(activeEventId, e => ({ ...e, teams: e.teams.map(t => t.id !== teamId ? t : { ...t, players: t.players.map(p => p.id === playerId ? { ...p, photo } : p) }) }));
  }
  function suspendTeam(teamId, suspended) {
    updateEvent(activeEventId, e => ({ ...e, teams: e.teams.map(t => t.id !== teamId ? t : { ...t, suspended }) }));
  }
  function updatePlayerField(teamId, playerId, field, value) {
    updateEvent(activeEventId, e => ({ ...e, teams: e.teams.map(t => t.id !== teamId ? t : { ...t, players: t.players.map(p => p.id === playerId ? { ...p, [field]: value } : p) }) }));
  }
  function setCaptain(teamId, playerId) {
    updateEvent(activeEventId, e => ({ ...e, teams: e.teams.map(t => t.id !== teamId ? t : { ...t, captainId: playerId }) }));
  }
  function suspendPlayer(teamId, playerId, manuallySuspended) {
    updateEvent(activeEventId, e => ({ ...e, teams: e.teams.map(t => t.id !== teamId ? t : { ...t, players: t.players.map(p => p.id === playerId ? { ...p, manuallySuspended } : p) }) }));
  }

  /* ---------- officiels (badge par équipe) ---------- */
  function addOfficial(teamId, name, role) {
    if (!name?.trim()) return;
    updateEvent(activeEventId, e => ({
      ...e,
      teams: e.teams.map(t => {
        if (t.id !== teamId) return t;
        const officials = t.officials || [];
        const prefix = (e.settings.name || "TMP").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "TMP";
        const matricule = `${prefix}-OFF-${String(t.id).padStart(2, "0")}-${String(officials.length + 1).padStart(2, "0")}`;
        return { ...t, officials: [...officials, { id: `${t.id}-off${Date.now()}`, name: name.trim(), role: role?.trim() || "Officiel", photo: null, matricule }] };
      }),
    }));
  }
  function removeOfficial(teamId, officialId) {
    updateEvent(activeEventId, e => ({ ...e, teams: e.teams.map(t => t.id !== teamId ? t : { ...t, officials: (t.officials || []).filter(o => o.id !== officialId) }) }));
  }
  function updateOfficialField(teamId, officialId, field, value) {
    updateEvent(activeEventId, e => ({ ...e, teams: e.teams.map(t => t.id !== teamId ? t : { ...t, officials: (t.officials || []).map(o => o.id === officialId ? { ...o, [field]: value } : o) }) }));
  }

  /* ---------- médias (badges au niveau de l'événement, pas rattachés à une équipe) ---------- */
  function addMedia(name, org, role) {
    if (!name?.trim()) return;
    updateEvent(activeEventId, e => {
      const media = e.media || [];
      const prefix = (e.settings.name || "TMP").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "TMP";
      const matricule = `${prefix}-MED-${String(media.length + 1).padStart(3, "0")}`;
      return { ...e, media: [...media, { id: `media-${Date.now()}`, name: name.trim(), org: org?.trim() || "", role: role?.trim() || "Presse", photo: null, matricule }] };
    });
  }
  function removeMedia(mediaId) {
    updateEvent(activeEventId, e => ({ ...e, media: (e.media || []).filter(m => m.id !== mediaId) }));
  }
  function updateMediaField(mediaId, field, value) {
    updateEvent(activeEventId, e => ({ ...e, media: (e.media || []).map(m => m.id === mediaId ? { ...m, [field]: value } : m) }));
  }

  /* ---------- accounts ---------- */
  async function addAccount() {
    if (!newAccount.name.trim() || !newAccount.email.trim()) return;
    setAccountError("");
    const password = newAccount.password.trim() || Math.random().toString(36).slice(-8);
    const eventIdForNew = isFullAdmin ? managingEventId : currentUser.eventId;
    const emailNorm = newAccount.email.trim().toLowerCase();
    try {
      const uid = await createAuthUserWithoutSignIn(emailNorm, password);
      const usernameNorm = normalizeIdentifier(newAccount.username);
      const phoneNorm = normalizeIdentifier(newAccount.phone);
      const profile = {
        name: newAccount.name.trim(), email: emailNorm, role: newAccount.role,
        ...(usernameNorm ? { username: usernameNorm } : {}),
        ...(newAccount.phone.trim() ? { phone: newAccount.phone.trim() } : {}),
        ...(EVENT_SCOPED_ROLES.includes(newAccount.role) ? { eventId: eventIdForNew } : {}),
        ...((newAccount.role === "president" || newAccount.role === "joueur") && newAccount.teamId !== "" ? { teamId: Number(newAccount.teamId) } : {}),
        ...(newAccount.role === "joueur" && newAccount.playerId !== "" ? { playerId: newAccount.playerId } : {}),
        ...((newAccount.role === "superviseur" || newAccount.role === "arbitre") && newAccount.canAuthorize ? { canAuthorize: true } : {}),
      };
      await setDoc(doc(db, "users", uid), profile);
      // Correspondances pour permettre la connexion par nom d'utilisateur / téléphone / ID profil, en plus de l'e-mail
      await setDoc(doc(db, "loginLookup", uid), { email: emailNorm });
      if (usernameNorm) await setDoc(doc(db, "loginLookup", usernameNorm), { email: emailNorm });
      if (phoneNorm) await setDoc(doc(db, "loginLookup", phoneNorm), { email: emailNorm });
      setJustCreated({ email: emailNorm, password, username: usernameNorm || null, uid });
      setNewAccount({ name: "", email: "", username: "", phone: "", role: "arbitre", teamId: "", playerId: "", password: "", canAuthorize: false });
    } catch (err) {
      setAccountError(AUTH_ERROR_MESSAGES[err.code] || "Échec de la création du compte.");
    }
  }
  function removeAccount(id) {
    if (id === currentUser?.id) return;
    if (!isFullAdmin) {
      const target = accounts.find(a => a.id === id);
      if (!target || target.eventId !== currentUser.eventId || !["president", "joueur"].includes(target.role)) return;
    }
    const target = accounts.find(a => a.id === id);
    if (target) {
      deleteDoc(doc(db, "loginLookup", id)).catch(() => {});
      if (target.username) deleteDoc(doc(db, "loginLookup", target.username)).catch(() => {});
      if (target.phone) deleteDoc(doc(db, "loginLookup", normalizeIdentifier(target.phone))).catch(() => {});
    }
    // Retire le profil applicatif (rôle/accès). La connexion Firebase Auth elle-même
    // doit être supprimée depuis Firebase Console > Authentication si besoin.
    deleteDoc(doc(db, "users", id)).catch(err => console.error("Échec de la suppression du compte:", err));
  }
  function toggleAuthorize(id) {
    const target = accounts.find(a => a.id === id);
    updateDoc(doc(db, "users", id), { canAuthorize: !target?.canAuthorize }).catch(err => console.error(err));
  }
  function suspendAccount(id, suspended) {
    if (id === currentUser?.id) return;
    updateDoc(doc(db, "users", id), { suspended }).catch(err => console.error(err));
  }
  function submitRefundRequest(teamId, playerIds, reason) {
    updateEvent(activeEventId, e => ({ ...e, refundRequests: [...(e.refundRequests || []), { id: `rf-${Date.now()}`, teamId, playerIds, reason, status: "pending" }] }));
  }
  function decideRefundRequest(id, decision) {
    updateEvent(activeEventId, e => ({ ...e, refundRequests: (e.refundRequests || []).map(r => r.id === id ? { ...r, status: decision } : r) }));
  }
  function updateAccountRole(id, role) {
    const target = accounts.find(a => a.id === id);
    const scoped = EVENT_SCOPED_ROLES.includes(role);
    const canAuthorizeStays = role === "superviseur" || role === "arbitre";
    const patch = { role, canAuthorize: canAuthorizeStays ? !!target?.canAuthorize : false };
    patch.eventId = scoped ? (target?.eventId || managingEventId) : deleteField();
    if (role !== "president" && role !== "joueur") patch.teamId = deleteField();
    updateDoc(doc(db, "users", id), patch).catch(err => console.error("Échec de la mise à jour du rôle:", err));
  }
  function updateAccountTeam(id, teamId) {
    const patch = teamId === "" ? { teamId: deleteField() } : { teamId: Number(teamId) };
    updateDoc(doc(db, "users", id), patch).catch(err => console.error(err));
  }

  /* ---------- events ---------- */
  const [eventJustCreated, setEventJustCreated] = useState(false);
  async function createEvent() {
    const name = newEventName.trim();
    if (!name) return;
    setEventError("");
    try {
      const ref = doc(collection(db, "events"));
      await setDoc(ref, { settings: defaultSettings(name), teams: [], pools: null, matches: [], refundRequests: [], bracket: null, pinned: false, createdBy: currentUser.id, createdByName: currentUser.name });
      setManagingEventId(ref.id);
      setNewEventName("");
      setView("setup");
      setEventJustCreated(true);
      setTimeout(() => setEventJustCreated(false), 6000);
    } catch (err) {
      console.error("Échec de la création de l'événement :", err);
      setEventError("Échec de la création de l'événement : " + (err.message || "erreur inconnue") + ". Vérifie que tu es bien connecté en tant qu'admin.");
    }
  }
  function togglePinEvent(eventId, currentlyPinned) {
    updateEvent(eventId, e => ({ ...e, pinned: !currentlyPinned }));
  }
  function suspendEvent(eventId, suspended) {
    updateEvent(eventId, e => ({ ...e, suspended }));
  }
  async function deleteEvent(eventId) {
    try {
      await deleteDoc(doc(db, "events", eventId));
      if (managingEventId === eventId) {
        const remaining = events.filter(e => e.id !== eventId);
        setManagingEventId(remaining[0]?.id || null);
      }
    } catch (err) {
      setEventError("Échec de la suppression : " + (err.message || "erreur inconnue"));
    }
  }

  /* ---------- draw ---------- */
  function runDraw(strategy) {
    updateEvent(activeEventId, e => { const { pools, matches, leftover } = drawPoolsAndMatches(e.teams, e.settings.poolSize, strategy || "balance"); return { ...e, pools, matches, bracket: null, poolLeftovers: leftover }; });
    setView("draw");
  }
  /* Déplace une équipe vers une autre poule (ou vers la liste d'attente / une poule vide nouvellement créée),
     et régénère uniquement les matchs des poules affectées (source et destination). Les résultats déjà
     enregistrés dans les matchs des AUTRES poules ne sont pas touchés. */
  function moveTeamToPool(teamId, targetPoolName) {
    updateEvent(activeEventId, e => {
      const nextPools = {};
      Object.entries(e.pools || {}).forEach(([name, ids]) => { nextPools[name] = ids.filter(id => id !== teamId); });
      let nextLeftover = (e.poolLeftovers || []).filter(id => id !== teamId);
      if (targetPoolName === "_waitlist") {
        nextLeftover = [...nextLeftover, teamId];
      } else {
        if (!nextPools[targetPoolName]) nextPools[targetPoolName] = [];
        nextPools[targetPoolName] = [...nextPools[targetPoolName], teamId];
      }
      const affectedPools = new Set([...Object.keys(e.pools || {}), targetPoolName].filter(n => n !== "_waitlist"));
      const untouchedMatches = (e.matches || []).filter(m => !affectedPools.has(m.pool));
      const regenerated = poolMatchesFromPools(Object.fromEntries(Object.entries(nextPools).filter(([name]) => affectedPools.has(name))));
      return { ...e, pools: nextPools, poolLeftovers: nextLeftover, matches: [...untouchedMatches, ...regenerated] };
    });
  }
  function addEmptyPool() {
    updateEvent(activeEventId, e => {
      const usedLetters = Object.keys(e.pools || {});
      const nextLetter = ["A", "B", "C", "D", "E", "F", "G", "H"].find(l => !usedLetters.includes(l));
      if (!nextLetter) return e;
      return { ...e, pools: { ...e.pools, [nextLetter]: [] } };
    });
  }
  function manualGenerateBracket() { updateEvent(activeEventId, e => ({ ...e, bracket: generateBracket(e) })); }

  /* ---------- match clock & lifecycle ---------- */
  function kickoff(matchId) { updateMatch(matchId, m => ({ ...m, status: "live", clock: { ...m.clock, period: "first", running: true, baseSeconds: 0, runningSince: Date.now() } })); }
  function toggleClock(matchId) {
    updateMatch(matchId, m => {
      if (m.clock.running) {
        const elapsed = (m.clock.baseSeconds || 0) + (Date.now() - m.clock.runningSince) / 1000;
        return { ...m, clock: { ...m.clock, running: false, baseSeconds: elapsed, runningSince: null } };
      }
      return { ...m, clock: { ...m.clock, running: true, runningSince: Date.now() } };
    });
  }
  function goToHalfTime(matchId) {
    updateMatch(matchId, m => {
      const baseSeconds = m.clock.running ? (m.clock.baseSeconds || 0) + (Date.now() - m.clock.runningSince) / 1000 : (m.clock.baseSeconds || 0);
      return { ...m, clock: { ...m.clock, period: "half", running: false, baseSeconds, runningSince: null } };
    });
  }
  function startSecondHalf(matchId) { updateMatch(matchId, m => ({ ...m, clock: { ...m.clock, period: "second", running: true, baseSeconds: 0, runningSince: Date.now() } })); }
  function setAddedTime(matchId, half, minutes) { updateMatch(matchId, m => ({ ...m, clock: { ...m.clock, [half === "first" ? "addedFirst" : "addedSecond"]: Math.max(0, minutes) } })); }
  function endMatch(matchId, penaltyWinnerId) {
    updateMatch(matchId, m => {
      const baseSeconds = m.clock.running ? (m.clock.baseSeconds || 0) + (Date.now() - m.clock.runningSince) / 1000 : (m.clock.baseSeconds || 0);
      return { ...m, status: "done", ...(penaltyWinnerId ? { penaltyWinner: penaltyWinnerId } : {}), clock: { ...m.clock, period: "done", running: false, baseSeconds, runningSince: null } };
    });
  }

  function validateLineup(matchId, teamId) {
    updateMatch(matchId, m => ({ ...m, lineups: { ...m.lineups, [teamId]: { ...m.lineups[teamId], validated: true } } }));
  }
  function submitLineup(matchId, teamId, starters, allPlayerIds) {
    updateMatch(matchId, m => ({ ...m, lineups: { ...m.lineups, [teamId]: { starters, bench: allPlayerIds.filter(id => !starters.includes(id)), validated: false } } }));
  }
  function requestSubstitution(matchId, teamId, outP, inP) {
    updateMatch(matchId, m => ({ ...m, subRequests: [...(m.subRequests || []), { id: `sub-${Date.now()}`, teamId, outId: outP.id, inId: inP.id, outName: outP.name, inName: inP.name, status: "pending" }] }));
  }
  function respondSubstitution(matchId, reqId, decision) {
    updateMatch(matchId, m => {
      const req = m.subRequests.find(r => r.id === reqId);
      if (!req) return m;
      const subRequests = m.subRequests.map(r => r.id === reqId ? { ...r, status: decision } : r);
      let evts = m.events;
      if (decision === "validated") evts = [...evts, { type: "substitution", teamId: req.teamId, outPlayerId: req.outId, inPlayerId: req.inId, outPlayerName: req.outName, inPlayerName: req.inName, minuteLabel: clockMinuteLabel(m.clock) }];
      return { ...m, subRequests, events: evts };
    });
  }

  function addMatchEvent(matchId, type, teamId, player) {
    updateMatch(matchId, m => {
      const minuteLabel = clockMinuteLabel(m.clock);
      let evts = [...(m.events || []), { type, teamId, playerId: player.id, playerName: player.name, minuteLabel }];
      let homeScore = m.homeScore, awayScore = m.awayScore;
      if (type === "goal") { if (teamId === m.home) homeScore++; else awayScore++; }
      if (type === "yellow") {
        const priorYellows = (m.events || []).filter(e => e.playerId === player.id && e.type === "yellow").length;
        if (priorYellows === 1) evts.push({ type: "red", teamId, playerId: player.id, playerName: player.name, minuteLabel, auto: true });
      }
      return { ...m, events: evts, homeScore, awayScore };
    });
  }

  /* ---------- shared UI bits ---------- */

  function MatchCard({ m, teamById: tb, onClick }) {
    const home = tb[m.home], away = tb[m.away];
    if (!home || !away) return null;
    const live = m.status === "live";
    return (
      <button onClick={onClick} className="w-full text-left bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow" style={{ borderColor: COLORS.line }}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: COLORS.turf }}>{m.pool ? `Poule ${m.pool}` : (m.roundLabel || "Phase finale")}</span>
          {live ? (
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase" style={{ color: COLORS.amber }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: COLORS.amber }} />
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: COLORS.amber }} />
              </span>
              {clockMinuteLabel(m.clock)}
            </span>
          ) : m.status === "done" ? <span className="text-[11px] font-bold uppercase text-stone-400">Terminé</span>
          : <span className="text-[11px] font-bold uppercase text-stone-400">À venir</span>}
        </div>
        <div className="px-4 py-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-2 min-w-0"><Badge name={home.name} logo={home.logo} size={32} /><span className="font-semibold text-sm truncate" style={{ color: COLORS.ink }}>{home.name}</span></div>
          <div className="font-mono font-bold text-xl tabular-nums px-2 py-1 rounded-md" style={{ background: COLORS.pitch, color: COLORS.chalk }}>{m.status === "scheduled" ? "–  –" : `${m.homeScore} – ${m.awayScore}`}</div>
          <div className="flex items-center gap-2 min-w-0 justify-end"><span className="font-semibold text-sm truncate text-right" style={{ color: COLORS.ink }}>{away.name}</span><Badge name={away.name} logo={away.logo} size={32} /></div>
        </div>
        {m.status !== "scheduled" && (m.events || []).some(e => e.type === "goal" || e.type === "yellow" || e.type === "red") && (
          <div className="px-4 pb-2 grid grid-cols-2 gap-3 text-[11px]">
            <div className="space-y-0.5">
              {(m.events || []).filter(e => e.teamId === m.home && e.type === "goal").map((g, i) => <div key={i} className="flex items-center gap-1 text-stone-500"><Target size={10} style={{ color: COLORS.turf }} />{g.playerName} <span className="text-stone-400">{g.minuteLabel}</span></div>)}
              {(m.events || []).filter(e => e.teamId === m.home && (e.type === "yellow" || e.type === "red")).map((c, i) => <div key={i} className="flex items-center gap-1 text-stone-500"><div className={`w-1.5 h-2.5 rounded-sm ${c.type === "yellow" ? "bg-yellow-400" : "bg-red-600"}`} />{c.playerName} <span className="text-stone-400">{c.minuteLabel}</span></div>)}
            </div>
            <div className="space-y-0.5 text-right">
              {(m.events || []).filter(e => e.teamId === m.away && e.type === "goal").map((g, i) => <div key={i} className="flex items-center justify-end gap-1 text-stone-500"><span className="text-stone-400">{g.minuteLabel}</span> {g.playerName}<Target size={10} style={{ color: COLORS.turf }} /></div>)}
              {(m.events || []).filter(e => e.teamId === m.away && (e.type === "yellow" || e.type === "red")).map((c, i) => <div key={i} className="flex items-center justify-end gap-1 text-stone-500"><span className="text-stone-400">{c.minuteLabel}</span> {c.playerName}<div className={`w-1.5 h-2.5 rounded-sm ${c.type === "yellow" ? "bg-yellow-400" : "bg-red-600"}`} /></div>)}
            </div>
          </div>
        )}
        <div className="px-4 pb-3 flex items-center gap-3 text-[12px] text-stone-500">
          <span className="flex items-center gap-1"><MapPin size={12} />{m.field}</span>
          <span className="flex items-center gap-1"><Clock size={12} />{m.time}</span>
        </div>
      </button>
    );
  }

  function BracketMatchCard({ m, teamById: tb, onClick }) {
    const home = m.home != null ? tb[m.home] : null;
    const away = m.away != null ? tb[m.away] : null;
    const clickable = home && away && typeof onClick === "function";
    const Wrapper = clickable ? "button" : "div";
    return (
      <Wrapper onClick={clickable ? onClick : undefined} className="w-full text-left bg-white rounded-xl border p-3" style={{ borderColor: COLORS.line, cursor: clickable ? "pointer" : "default" }}>
        {[[home, m.homeLabel, m.homeScore], [away, m.awayLabel, m.awayScore]].map(([team, label, score], i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1">
            <div className="flex items-center gap-2 min-w-0">
              {team ? <Badge name={team.name} logo={team.logo} size={22} /> : <div className="w-[22px] h-[22px] rounded-full border border-dashed" style={{ borderColor: COLORS.line }} />}
              <span className="text-sm font-medium truncate" style={{ color: team ? COLORS.ink : "#b4ada0" }}>{team ? team.name : (label || "À déterminer")}</span>
            </div>
            {m.status === "done" && <span className="font-mono font-bold text-sm shrink-0" style={{ color: COLORS.turf }}>{score}</span>}
          </div>
        ))}
        {m.status === "done" && m.penaltyWinner && <div className="text-[10px] text-stone-400 mt-1">Vainqueur aux tirs au but : {tb[m.penaltyWinner]?.name}</div>}
      </Wrapper>
    );
  }

  function BracketView({ bracket, teamById: tb, onMatchClick, printable }) {
    return (
      <div className={`flex gap-4 overflow-x-auto pb-2 ${printable ? "" : ""}`}>
        {bracket.rounds.map((round, ri) => (
          <div key={ri} className="min-w-[220px] flex-1 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-center py-1.5 rounded-lg" style={{ background: COLORS.pitch, color: "#fff" }}>{bracket.roundNames[ri]}</div>
            <div className="space-y-3">
              {round.map(m => <BracketMatchCard key={m.id} m={m} teamById={tb} onClick={onMatchClick && m.home != null && m.away != null ? () => onMatchClick(m) : undefined} />)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function PrintableSchedule({ ev, teamById: tb }) {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", color: "#111" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 2 }}>{ev.settings.name}</h1>
        <p style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>Calendrier officiel — {ev.matches.length} match(s) de poule{ev.bracket ? " + phase finale" : ""}</p>
        {Object.entries(ev.pools || {}).map(([poolName, ids]) => (
          <div key={poolName} style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, marginBottom: 6, textTransform: "uppercase" }}>Poule {poolName} — {ids.filter(id => tb[id]).map(id => tb[id].name).join(", ")}</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: "2px solid #111" }}><th style={{ textAlign: "left", padding: "4px 6px" }}>Heure</th><th style={{ textAlign: "left", padding: "4px 6px" }}>Terrain</th><th style={{ textAlign: "left", padding: "4px 6px" }}>Rencontre</th><th style={{ textAlign: "center", padding: "4px 6px" }}>Score</th></tr></thead>
              <tbody>
                {ev.matches.filter(m => m.pool === poolName).map(m => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "4px 6px" }}>{m.time}</td>
                    <td style={{ padding: "4px 6px" }}>{m.field}</td>
                    <td style={{ padding: "4px 6px" }}>{tb[m.home]?.name} vs {tb[m.away]?.name}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>{m.status === "done" ? `${m.homeScore} – ${m.awayScore}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {ev.bracket && <PrintableBracket bracket={ev.bracket} teamById={tb} eventName={null} />}
      </div>
    );
  }

  function PrintableBracket({ bracket, teamById: tb, eventName }) {
    if (!bracket) return <p style={{ fontSize: 12, color: "#666" }}>Phase finale non générée.</p>;
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", color: "#111" }}>
        {eventName && <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>{eventName} — Phase finale</h1>}
        {!eventName && <h2 style={{ fontSize: 14, fontWeight: 800, marginTop: 20, marginBottom: 6, textTransform: "uppercase" }}>Phase finale</h2>}
        {bracket.rounds.map((round, ri) => (
          <div key={ri} style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>{bracket.roundNames[ri]}</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                {round.map(m => (
                  <tr key={m.id} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{ padding: "4px 6px" }}>{m.home != null ? tb[m.home]?.name : (m.homeLabel || "À déterminer")}</td>
                    <td style={{ padding: "4px 6px", textAlign: "center", fontWeight: 700 }}>{m.status === "done" ? `${m.homeScore} – ${m.awayScore}` : "vs"}</td>
                    <td style={{ padding: "4px 6px" }}>{m.away != null ? tb[m.away]?.name : (m.awayLabel || "À déterminer")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    );
  }

  function PrintableMatchSheet({ match, home, away, teamById: tb }) {
    const goals = (match.events || []).filter(e => e.type === "goal");
    const cards = (match.events || []).filter(e => e.type === "yellow" || e.type === "red");
    const subs = (match.events || []).filter(e => e.type === "substitution");
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", color: "#111" }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 2 }}>Feuille de match officielle</h1>
        <p style={{ fontSize: 12, color: "#666", marginBottom: 14 }}>{match.field} · {match.time}{match.pool ? ` · Poule ${match.pool}` : ""}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, border: "2px solid #111", borderRadius: 8, padding: "10px 16px" }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{home?.name}</span>
          <span style={{ fontWeight: 900, fontSize: 22 }}>{match.status === "done" ? `${match.homeScore} – ${match.awayScore}` : "— – —"}</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{away?.name}</span>
        </div>
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>Buteurs</h2>
        {goals.length === 0 ? <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Aucun but.</p> : (
          <ul style={{ fontSize: 12, marginBottom: 12, paddingLeft: 18 }}>{goals.map((g, i) => <li key={i}>{g.minuteLabel} — {g.playerName} ({tb[g.teamId]?.name})</li>)}</ul>
        )}
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>Cartons</h2>
        {cards.length === 0 ? <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Aucun carton.</p> : (
          <ul style={{ fontSize: 12, marginBottom: 12, paddingLeft: 18 }}>{cards.map((c, i) => <li key={i}>{c.minuteLabel} — {c.type === "yellow" ? "Jaune" : "Rouge"} : {c.playerName} ({tb[c.teamId]?.name}){c.auto ? " (2e jaune)" : ""}</li>)}</ul>
        )}
        <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>Remplacements</h2>
        {subs.length === 0 ? <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>Aucun remplacement.</p> : (
          <ul style={{ fontSize: 12, marginBottom: 12, paddingLeft: 18 }}>{subs.map((s, i) => <li key={i}>{s.minuteLabel} — {s.outPlayerName} ➜ {s.inPlayerName} ({tb[s.teamId]?.name})</li>)}</ul>
        )}
        <div style={{ display: "flex", gap: 16 }}>
          {[[home, match.home], [away, match.away]].map(([team, teamId], i) => {
            const lineup = match.lineups?.[teamId];
            return (
              <div key={i} style={{ flex: 1 }}>
                <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>Composition — {team?.name}</h2>
                {!lineup?.starters?.length ? <p style={{ fontSize: 12, color: "#666" }}>Non renseignée.</p> : (
                  <ul style={{ fontSize: 12, paddingLeft: 18, columns: 2 }}>{lineup.starters.map(pid => { const p = team.players.find(x => x.id === pid); return p ? <li key={pid}>#{p.number} {p.name}</li> : null; })}</ul>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 32, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
          <div>Signature de l'arbitre : ______________________</div>
          <div>Signature du superviseur : ______________________</div>
        </div>
      </div>
    );
  }

  function Toggle({ checked, onChange, label, hint }) {
    return (
      <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
        <div><div className="text-sm font-semibold" style={{ color: COLORS.ink }}>{label}</div>{hint && <div className="text-xs text-stone-500 mt-0.5">{hint}</div>}</div>
        <button type="button" onClick={() => onChange(!checked)} className="shrink-0 w-11 h-6 rounded-full relative transition-colors" style={{ background: checked ? COLORS.turf : "#D6D0C0" }}>
          <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }} />
        </button>
      </label>
    );
  }
  function SectionTitle({ eyebrow, title, count }) {
    return (
      <div className="mb-6 flex items-end justify-between">
        <div><div className="text-[11px] font-bold uppercase tracking-[0.15em] mb-1" style={{ color: COLORS.turf }}>{eyebrow}</div><h1 className="text-2xl font-black" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>{title}</h1></div>
        {count && <span className="text-xs font-medium text-stone-400">{count}</span>}
      </div>
    );
  }
  function NumberField({ label, value, onChange }) {
    return (
      <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">{label}</label>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} className="w-full border rounded-lg px-3 py-2 font-mono outline-none" style={{ borderColor: COLORS.line, color: COLORS.ink }} /></div>
    );
  }
  function EmptyState({ text }) {
    return <div className="max-w-md py-16 text-center"><Circle size={24} className="mx-auto mb-3 text-stone-300" /><p className="text-sm text-stone-500">{text}</p></div>;
  }
  function StatusPill({ ev }) {
    const played = ev.matches.filter(m => m.status === "done").length;
    const live = ev.matches.some(m => m.status === "live");
    const finished = ev.matches.length > 0 && played === ev.matches.length;
    const label = !ev.pools ? "Brouillon" : live ? "En direct" : finished ? "Terminé" : "Publié";
    const bg = !ev.pools ? "rgba(20,32,26,0.06)" : live ? "rgba(245,166,35,0.15)" : finished ? "rgba(20,32,26,0.06)" : "rgba(31,110,67,0.1)";
    const color = !ev.pools ? "#8a8a80" : live ? COLORS.amber : finished ? "#8a8a80" : COLORS.turf;
    return <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full" style={{ background: bg, color }}>{label}</span>;
  }

  /* ---------- LOGIN ---------- */

  /* ---------- ADMIN VIEWS ---------- */

  function SetupView() {
    const draft = configDraft || settings;
    function patchDraft(patch) { setConfigDraft({ ...draft, ...patch }); setConfigSaved(false); }
    function saveConfig() {
      try {
        patchSettings(draft);
        setConfigDraft(null);
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 4000);
      } catch (err) {
        console.error("Échec de l'enregistrement de la configuration :", err);
        alert("Erreur : " + (err?.message || err));
      }
    }
    const isDirty = configDraft !== null;
    return (
      <div className="max-w-3xl">
        <SectionTitle eyebrow={`Admin — ${managingEvent.settings.name}`} title="Configuration du tournoi" />
        {eventJustCreated && (
          <div className="flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl mb-4" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>
            <CheckCircle2 size={16} />Événement créé ! Règle les paramètres ci-dessous, puis rends-toi dans "Équipes" pour commencer les inscriptions.
          </div>
        )}
        {configSaved && (
          <div className="flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl mb-4" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>
            <CheckCircle2 size={16} />Configuration enregistrée.
          </div>
        )}
        <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: COLORS.line }}>
          <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1.5">Nom du tournoi</label>
          <input value={draft.name} onChange={e => patchDraft({ name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-lg font-bold outline-none focus:ring-2" style={{ borderColor: COLORS.line, color: COLORS.ink }} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
            {NumberField({ label: "Points victoire", value: draft.win, onChange: v => patchDraft({ win: v }) })}
            {NumberField({ label: "Points nul", value: draft.draw, onChange: v => patchDraft({ draw: v }) })}
            {NumberField({ label: "Points défaite", value: draft.loss, onChange: v => patchDraft({ loss: v }) })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            {NumberField({ label: "Durée mi-temps (min)", value: draft.halfMinutes, onChange: v => patchDraft({ halfMinutes: v }) })}
            {NumberField({ label: "Remplacements autorisés", value: draft.subs, onChange: v => patchDraft({ subs: v }) })}
            {NumberField({ label: "Équipes par poule", value: draft.poolSize, onChange: v => patchDraft({ poolSize: v }) })}
          </div>
        </div>
        <div className="bg-white rounded-2xl border p-6 divide-y" style={{ borderColor: COLORS.line }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 pb-2">Activation des fonctionnalités</div>
          <Toggle checked={draft.showPlayerProfiles} onChange={v => patchDraft({ showPlayerProfiles: v })} label="Profil joueur" hint="Chaque joueur peut consulter ses statistiques et ses prochains matchs." />
          <Toggle checked={draft.showTopScorers} onChange={v => patchDraft({ showTopScorers: v })} label="Classement des buteurs" hint="Affiche le tableau des meilleurs buteurs/passeurs sur le dashboard public." />
          <Toggle checked={draft.manualDraw} onChange={v => patchDraft({ manualDraw: v })} label="Tirage manuel" hint="Désactive le tirage automatique au profit d'une répartition manuelle des poules." />
          <Toggle checked={draft.allowTeamRemovalAfterLaunch} onChange={v => patchDraft({ allowTeamRemovalAfterLaunch: v })} label="Retrait d'équipe après lancement" hint="Si désactivé, une équipe ne peut plus être retirée une fois le tirage au sort effectué." />
          <Toggle checked={draft.requireTeamLogo} onChange={v => patchDraft({ requireTeamLogo: v })} label="Logo d'équipe obligatoire" hint="Si activé, impossible d'inscrire une équipe sans avoir importé son logo." />
          <Toggle checked={draft.showScorerPhoto} onChange={v => patchDraft({ showScorerPhoto: v })} label="Photo des buteurs" hint="Affiche la photo du joueur à côté de son nom dans la liste des buteurs de chaque match." />
          <Toggle checked={draft.showCaptainPhoto} onChange={v => patchDraft({ showCaptainPhoto: v })} label="Photo du capitaine" hint="Affiche la photo du capitaine d'équipe sur les affiches/programmes de match." />
          <Toggle checked={draft.publicAccess} onChange={v => patchDraft({ publicAccess: v })} label="Accès public (sans connexion)" hint="Si activé, le programme et les statistiques de cet événement sont visibles par le grand public sans se connecter, dès que le tirage est lancé." />
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">{NumberField({ label: "Cartons jaunes avant suspension", value: draft.suspensionRule, onChange: v => patchDraft({ suspensionRule: v }) })}{NumberField({ label: "Qualifiés par poule (phase finale)", value: draft.qualifiersPerPool, onChange: v => patchDraft({ qualifiersPerPool: v }) })}</div>
        </div>
        <div className="sticky bottom-4 mt-6 flex justify-end">
          <button
            type="button"
            onClick={saveConfig}
            disabled={!isDirty}
            className="px-6 py-3 rounded-xl font-bold text-sm text-white shadow-lg flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: COLORS.turf }}
          >
            <CheckCircle2 size={16} />{isDirty ? "Enregistrer les modifications" : "Aucune modification à enregistrer"}
          </button>
        </div>
      </div>
    );
  }

  function CardsView() {
    const cardCfg = cardConfigDraft || settings;
    function patchCardDraft(patch) { setCardConfigDraft({ ...cardCfg, ...patch }); setCardConfigSaved(false); }
    function saveCardConfig() {
      try {
        patchSettings(cardConfigDraft || {});
        setCardConfigDraft(null);
        setCardConfigSaved(true);
        setTimeout(() => setCardConfigSaved(false), 4000);
      } catch (err) {
        console.error("Échec de l'enregistrement de la configuration des cartes :", err);
        alert("Erreur : " + (err?.message || err));
      }
    }
    const cardCfgDirty = cardConfigDraft !== null;

    const allCards = [];
    teams.forEach(t => {
      (t.players || []).forEach(p => allCards.push({ key: `player-${t.id}-${p.id}`, kind: "joueur", name: p.name, group: t.name, idValue: p.license, photo: p.photo, headerFallback: `${activeEvent.settings.name} — ${t.name}`, teamId: t.id, entityId: p.id }));
      (t.officials || []).forEach(o => allCards.push({ key: `official-${t.id}-${o.id}`, kind: "officiel", name: o.name, group: `${t.name} — ${o.role}`, idValue: o.matricule, photo: o.photo, headerFallback: `${activeEvent.settings.name} — ${t.name}`, teamId: t.id, entityId: o.id }));
    });
    (activeEvent.media || []).forEach(m => allCards.push({ key: `media-${m.id}`, kind: "media", name: m.name, group: [m.org, m.role].filter(Boolean).join(" — "), idValue: m.matricule, photo: m.photo, headerFallback: `${activeEvent.settings.name} — ${m.org || "Presse"}`, teamId: null, entityId: m.id }));

    const selectedCards = allCards.filter(c => selectedCardIds[c.key]);
    const selectedCount = selectedCards.length;
    function toggleCard(key) { setSelectedCardIds(s => ({ ...s, [key]: !s[key] })); }
    function selectAll() { const next = {}; allCards.forEach(c => { next[c.key] = true; }); setSelectedCardIds(next); }
    function deselectAll() { setSelectedCardIds({}); }

    const preset = CARD_SIZE_PRESETS[cardCfg.cardSizePreset] || CARD_SIZE_PRESETS["86x54"];
    const vertical = cardCfg.cardOrientation === "vertical";
    const cardW = vertical ? Math.min(preset.w, preset.h) : Math.max(preset.w, preset.h);
    const cardH = vertical ? Math.max(preset.w, preset.h) : Math.min(preset.w, preset.h);
    const paper = PAPER_SIZES[printPaper];
    const cols = Math.max(1, Math.floor((paper.w - 2 * printMargin + printGap) / (cardW + printGap)));
    const rows = Math.max(1, Math.floor((paper.h - 2 * printMargin + printGap) / (cardH + printGap)));
    const perPage = cols * rows;
    const validityLabel = cardCfg.cardValidity ? new Date(cardCfg.cardValidity + "T00:00:00").toLocaleDateString("fr-FR") : "";

    return (
      <div className="max-w-4xl">
        <SectionTitle eyebrow={ROLE_LABELS[currentUser.role]} title="Cartes & Licences" count={`${allCards.length} profils`} />
        {cardConfigSaved && (
          <div className="flex items-center gap-2 text-sm font-semibold px-4 py-3 rounded-xl mb-4" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>
            <CheckCircle2 size={16} />Configuration des cartes enregistrée.
          </div>
        )}

        {/* Configuration visuelle */}
        <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: COLORS.line }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-4">Validité et en-tête</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Date de validité</label>
              <input type="date" value={cardCfg.cardValidity || ""} onChange={e => patchCardDraft({ cardValidity: e.target.value })} className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">En-tête personnalisé (optionnel)</label>
              <input value={cardCfg.cardHeader || ""} onChange={e => patchCardDraft({ cardHeader: e.target.value })} placeholder={`${activeEvent.settings.name} — Nom d'équipe`} className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-4 pt-2">Mise en page de la carte</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Orientation</label>
              <select value={cardCfg.cardOrientation} onChange={e => patchCardDraft({ cardOrientation: e.target.value })} className="w-full border rounded-lg px-3 py-2 outline-none bg-white" style={{ borderColor: COLORS.line }}>
                <option value="horizontal">Horizontal</option><option value="vertical">Vertical</option>
              </select></div>
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Format</label>
              <select value={cardCfg.cardSizePreset} onChange={e => patchCardDraft({ cardSizePreset: e.target.value })} className="w-full border rounded-lg px-3 py-2 outline-none bg-white" style={{ borderColor: COLORS.line }}>
                {Object.entries(CARD_SIZE_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Couleur de fond</label>
              <input type="color" value={cardCfg.cardBg} onChange={e => patchCardDraft({ cardBg: e.target.value })} className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: COLORS.line }} /></div>
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Couleur d'accent / bordure</label>
              <input type="color" value={cardCfg.cardBorder} onChange={e => patchCardDraft({ cardBorder: e.target.value })} className="w-full h-9 rounded-lg border cursor-pointer" style={{ borderColor: COLORS.line }} /></div>
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Position de la photo</label>
              <select value={cardCfg.cardPhotoPosition} onChange={e => patchCardDraft({ cardPhotoPosition: e.target.value })} className="w-full border rounded-lg px-3 py-2 outline-none bg-white" style={{ borderColor: COLORS.line }}>
                <option value="left">Gauche</option><option value="right">Droite</option><option value="center">Centré</option>
              </select></div>
          </div>
          <div className="flex items-center justify-between mt-5 pt-4 border-t" style={{ borderColor: COLORS.line }}>
            <div className="scale-90 origin-left"><CardFace kind="joueur" name="Aperçu Joueur" subLabel="Équipe exemple" idValue="EX-01-01" photo={null} headerText={(cardCfg.cardHeader || "").trim() || `${activeEvent.settings.name} — Équipe exemple`} validity={validityLabel} cfg={cardCfg} /></div>
            <button type="button" onClick={saveCardConfig} disabled={!cardCfgDirty} className="px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: COLORS.turf }}>
              <CheckCircle2 size={16} />{cardCfgDirty ? "Enregistrer la configuration" : "Aucune modification"}
            </button>
          </div>
        </div>

        {/* Ajout officiel */}
        <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: COLORS.line }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3">Ajouter un officiel (badge d'équipe)</div>
          <div className="flex flex-wrap gap-3">
            <select value={newOfficial.teamId} onChange={e => setNewOfficial({ ...newOfficial, teamId: e.target.value })} className="border rounded-lg px-3 py-2 outline-none bg-white flex-1 min-w-[140px]" style={{ borderColor: COLORS.line }}>
              <option value="">Équipe…</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input value={newOfficial.name} onChange={e => setNewOfficial({ ...newOfficial, name: e.target.value })} placeholder="Nom complet" className="border rounded-lg px-3 py-2 outline-none flex-1 min-w-[140px]" style={{ borderColor: COLORS.line }} />
            <input value={newOfficial.role} onChange={e => setNewOfficial({ ...newOfficial, role: e.target.value })} placeholder="Fonction (entraîneur adjoint, kiné...)" className="border rounded-lg px-3 py-2 outline-none flex-1 min-w-[160px]" style={{ borderColor: COLORS.line }} />
            <button type="button" onClick={() => { if (!newOfficial.teamId || !newOfficial.name.trim()) return; addOfficial(newOfficial.teamId, newOfficial.name, newOfficial.role); setNewOfficial({ teamId: newOfficial.teamId, name: "", role: "" }); }} disabled={!newOfficial.teamId || !newOfficial.name.trim()} className="px-4 py-2 rounded-lg font-semibold text-sm text-white flex items-center gap-1.5 disabled:opacity-40" style={{ background: COLORS.turf }}><Plus size={15} />Ajouter</button>
          </div>
        </div>

        {/* Ajout média */}
        <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: COLORS.line }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3">Ajouter un profil média / presse</div>
          <div className="flex flex-wrap gap-3">
            <input value={newMedia.name} onChange={e => setNewMedia({ ...newMedia, name: e.target.value })} placeholder="Nom complet" className="border rounded-lg px-3 py-2 outline-none flex-1 min-w-[140px]" style={{ borderColor: COLORS.line }} />
            <input value={newMedia.org} onChange={e => setNewMedia({ ...newMedia, org: e.target.value })} placeholder="Organisme / média" className="border rounded-lg px-3 py-2 outline-none flex-1 min-w-[140px]" style={{ borderColor: COLORS.line }} />
            <input value={newMedia.role} onChange={e => setNewMedia({ ...newMedia, role: e.target.value })} placeholder="Rôle (photographe, journaliste...)" className="border rounded-lg px-3 py-2 outline-none flex-1 min-w-[160px]" style={{ borderColor: COLORS.line }} />
            <button type="button" onClick={() => { if (!newMedia.name.trim()) return; addMedia(newMedia.name, newMedia.org, newMedia.role); setNewMedia({ name: "", org: "", role: "" }); }} disabled={!newMedia.name.trim()} className="px-4 py-2 rounded-lg font-semibold text-sm text-white flex items-center gap-1.5 disabled:opacity-40" style={{ background: COLORS.turf }}><Plus size={15} />Ajouter</button>
          </div>
        </div>

        {/* Sélection & impression */}
        <div className="bg-white rounded-2xl border p-6" style={{ borderColor: COLORS.line }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sélection pour impression ({selectedCount} sélectionné{selectedCount > 1 ? "s" : ""})</div>
            <div className="flex gap-2">
              <button type="button" onClick={selectAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: COLORS.line, color: COLORS.turf }}>Tout sélectionner</button>
              <button type="button" onClick={deselectAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg border text-stone-400" style={{ borderColor: COLORS.line }}>Tout désélectionner</button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto border rounded-xl divide-y mb-5" style={{ borderColor: COLORS.line }}>
            {allCards.length === 0 && <div className="p-4 text-sm text-stone-400">Aucun profil (joueur, officiel ou média) pour l'instant.</div>}
            {allCards.map(c => (
              <label key={c.key} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-stone-50">
                <input type="checkbox" checked={!!selectedCardIds[c.key]} onChange={() => toggleCard(c.key)} className="shrink-0" />
                <PlayerAvatar name={c.name} photo={c.photo} size={26} />
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{c.name}</div><div className="text-xs text-stone-400 truncate">{c.group}</div></div>
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>{CARD_KIND_LABELS[c.kind]}</span>
                <span className="font-mono text-xs shrink-0" style={{ color: COLORS.turf }}>{c.idValue || "—"}</span>
                {c.kind !== "joueur" && (
                  <>
                    <span onClick={e => e.stopPropagation()} className="shrink-0">
                      <input type="file" accept="image/*" className="hidden" id={`photo-${c.key}`} onChange={e => handleLogoFile(e, photo => { if (c.kind === "officiel") updateOfficialField(c.teamId, c.entityId, "photo", photo); else updateMediaField(c.entityId, "photo", photo); })} />
                      <label htmlFor={`photo-${c.key}`} className="text-stone-300 hover:text-stone-500 cursor-pointer" title="Photo"><Upload size={14} /></label>
                    </span>
                    <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); if (c.kind === "officiel") removeOfficial(c.teamId, c.entityId); else removeMedia(c.entityId); setSelectedCardIds(s => { const n = { ...s }; delete n[c.key]; return n; }); }} className="text-stone-300 hover:text-red-600 shrink-0" title="Supprimer"><Trash2 size={14} /></button>
                  </>
                )}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Feuille</label>
              <select value={printPaper} onChange={e => setPrintPaper(e.target.value)} className="w-full border rounded-lg px-3 py-2 outline-none bg-white" style={{ borderColor: COLORS.line }}>
                <option value="A4">A4</option><option value="A3">A3</option>
              </select></div>
            {NumberField({ label: "Marge (mm)", value: printMargin, onChange: setPrintMargin })}
            {NumberField({ label: "Espacement (mm)", value: printGap, onChange: setPrintGap })}
            <div><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Cartes / page</label>
              <div className="border rounded-lg px-3 py-2 font-mono font-bold" style={{ borderColor: COLORS.line, color: COLORS.turf }}>{perPage} ({cols}×{rows})</div></div>
          </div>
          <button type="button" onClick={() => setPrintingCards(true)} disabled={selectedCount === 0} className="w-full px-4 py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: COLORS.turf }}>
            <Printer size={16} />Aperçu et impression ({selectedCount})
          </button>
          <p className="text-[11px] text-stone-400 mt-2">Dans la boîte de dialogue d'impression du navigateur, choisis le format de feuille ({printPaper}) correspondant pour un rendu fidèle.</p>
        </div>

        {printingCards && (
          <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPrintingCards(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4 no-print">
                <h3 className="font-black text-lg" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Aperçu d'impression — {selectedCount} carte{selectedCount > 1 ? "s" : ""}</h3>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: COLORS.turf }}><Printer size={13} />Imprimer</button>
                  <button onClick={() => setPrintingCards(false)} className="text-stone-400 hover:text-stone-600 text-sm font-semibold">Fermer</button>
                </div>
              </div>
              <div className="print-area" style={{ display: "flex", flexWrap: "wrap", gap: `${printGap}mm`, padding: `${printMargin}mm` }}>
                {selectedCards.map(c => (
                  <CardFace key={c.key} kind={c.kind} name={c.name} subLabel={c.group} idValue={c.idValue} photo={c.photo} headerText={(cardCfg.cardHeader || "").trim() || c.headerFallback} validity={validityLabel} cfg={cardCfg} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function EventsView() {
    const sorted = [...myEvents].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return (
      <div className="max-w-2xl">
        <SectionTitle eyebrow={ROLE_LABELS[currentUser.role]} title="Mes événements" count={`${myEvents.length} événements`} />
        <p className="text-xs text-stone-400 -mt-2 mb-4">Chaque événement est un espace de gestion indépendant (équipes, joueurs, utilisateurs, cartes, tirage...). Ouvre un événement ci-dessous pour y entrer.</p>
        {eventsListenerError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">Impossible de charger les événements : {eventsListenerError}</p>}
        {eventError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{eventError}</p>}
        <div className="bg-white rounded-2xl border p-5 mb-6 flex gap-3" style={{ borderColor: COLORS.line }}>
          <input value={newEventName} onChange={e => setNewEventName(e.target.value)} placeholder="Nom du nouveau tournoi" className="flex-1 border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} />
          <button
            type="button"
            onClick={() => {
              try {
                const name = newEventName.trim();
                if (!name) { setEventError("Le nom du tournoi est vide."); return; }
                setEventError("");
                askSaveConfirm("Un nouvel événement sera créé et deviendra l'événement géré.", [{ label: "Nom du tournoi", value: name }], createEvent, "Créer l'événement");
              } catch (err) {
                console.error("Erreur au clic sur Créer l'événement :", err);
                alert("Erreur inattendue : " + (err?.message || err));
              }
            }}
            className="px-4 py-2 rounded-lg font-semibold text-sm text-white flex items-center gap-1.5 shrink-0" style={{ background: COLORS.turf }}
          ><Plus size={16} />Créer l'événement</button>
        </div>
        <div className="space-y-2">
          {sorted.map(ev => {
            const active = ev.id === managingEventId;
            return (
              <div key={ev.id} className="w-full flex items-center justify-between bg-white rounded-xl border p-4" style={{ borderColor: active ? COLORS.turf : COLORS.line, boxShadow: active ? `0 0 0 1px ${COLORS.turf}` : "none" }}>
                <button onClick={() => { setManagingEventId(ev.id); setView("setup"); }} className="flex-1 text-left flex items-center gap-2 min-w-0">
                  {ev.pinned && <Star size={14} fill={COLORS.amber} style={{ color: COLORS.amber }} className="shrink-0" />}
                  <div className="min-w-0"><div className="font-bold truncate flex items-center gap-1.5" style={{ color: COLORS.ink }}>{ev.settings.name}{ev.suspended && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Suspendu</span>}</div><div className="text-xs text-stone-500">{ev.teams.length} équipes · {ev.matches.length} matchs programmés{currentUser.role === "super_admin" && ev.createdByName ? ` · Organisateur : ${ev.createdByName}` : ""}</div></div>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => togglePinEvent(ev.id, ev.pinned)} title={ev.pinned ? "Désépingler" : "Épingler en première position"} className="text-stone-300 hover:text-amber-500" style={ev.pinned ? { color: COLORS.amber } : {}}>
                    <Star size={16} fill={ev.pinned ? COLORS.amber : "none"} />
                  </button>
                  {currentUser.role === "super_admin" && (
                    <>
                      <button onClick={() => askSaveConfirm(ev.suspended ? `L'événement "${ev.settings.name}" sera réactivé.` : `L'événement "${ev.settings.name}" sera suspendu — masqué du Dashboard public jusqu'à réactivation.`, [], () => suspendEvent(ev.id, !ev.suspended), ev.suspended ? "Réactiver" : "Suspendre")} title={ev.suspended ? "Réactiver" : "Suspendre"} className="text-stone-300 hover:text-amber-600"><Ban size={16} /></button>
                      <button onClick={() => askDeleteConfirm(`l'événement "${ev.settings.name}" (irréversible, toutes ses données)`, () => deleteEvent(ev.id))} title="Supprimer définitivement" className="text-stone-300 hover:text-red-700"><Trash2 size={16} /></button>
                    </>
                  )}
                  <StatusPill ev={ev} />{active && <span className="text-[10px] font-bold uppercase" style={{ color: COLORS.turf }}>Géré actuellement</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-stone-400 mt-4">Un événement apparaît automatiquement sur le Dashboard public dès que son tirage au sort est lancé. L'étoile épingle un événement en première position sur la page publique.</p>
      </div>
    );
  }

  function UsersView() {
    const usersEvent = isFullAdmin ? managingEvent : activeEvent;
    const visibleAccounts = currentUser.role === "super_admin"
      ? accounts
      : currentUser.role === "admin"
        ? accounts.filter(a => myEventIds.has(a.eventId))
        : accounts.filter(a => a.eventId === activeEventId && (a.role === "president" || a.role === "joueur"));
    // Seul le Super-Administrateur peut créer un autre compte "Administrateur d'événement" (organisateur) —
    // un Administrateur d'événement ne peut créer que le staff (superviseur, arbitre, président, joueur) de SON événement.
    const roleOptions = currentUser.role === "super_admin"
      ? Object.entries(ROLE_LABELS)
      : isFullAdmin
        ? Object.entries(ROLE_LABELS).filter(([k]) => k !== "super_admin" && k !== "admin")
        : [["president", ROLE_LABELS.president], ["joueur", ROLE_LABELS.joueur]];

    function onRoleFieldChange(role) {
      setNewAccount({ ...newAccount, role, teamId: "", playerId: "" });
    }
    function onTeamFieldChange(teamId) {
      const team = usersEvent.teams.find(t => t.id === Number(teamId));
      setNewAccount(prev => ({ ...prev, teamId, playerId: "", name: (!prev.name && prev.role === "president" && team) ? team.coachName || "" : prev.name }));
    }

    return (
      <div className="max-w-3xl">
        <SectionTitle eyebrow={isFullAdmin ? `Admin — ${managingEvent.settings.name}` : `Ayant droit — ${usersEvent.settings.name}`} title="Utilisateurs & rôles" count={`${visibleAccounts.length} comptes`} />
        {!isFullAdmin && <p className="text-xs text-stone-500 bg-white border rounded-lg px-3 py-2 mb-4" style={{ borderColor: COLORS.line }}>En tant qu'ayant droit, vous pouvez créer des comptes Coach et Joueur pour <strong>{usersEvent.settings.name}</strong>.</p>}
        {justCreated && (
          <div className="flex items-start justify-between gap-3 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4">
            <div><strong>Compte créé.</strong> Transmettez ces identifiants maintenant — le mot de passe ne sera plus jamais affiché ici : <br />
              <span className="font-mono">{justCreated.email}{justCreated.username ? ` (ou "${justCreated.username}")` : ""} / {justCreated.password}</span>
              <div className="text-xs text-stone-500 mt-1">La connexion accepte aussi le téléphone ou l'ID profil ({justCreated.uid}) si besoin.</div>
            </div>
            <button onClick={() => setJustCreated(null)} className="text-emerald-700 font-semibold shrink-0">OK</button>
          </div>
        )}
        {accountError && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{accountError}</p>}
        <div className="bg-white rounded-2xl border p-5 mb-6" style={{ borderColor: COLORS.line }}>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[140px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Nom</label><input value={newAccount.name} onChange={e => setNewAccount({ ...newAccount, name: e.target.value })} placeholder="Prénom Nom" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
            <div className="flex-1 min-w-[160px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">E-mail</label><input value={newAccount.email} onChange={e => setNewAccount({ ...newAccount, email: e.target.value })} placeholder="nom@club.io" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
            <div className="min-w-[140px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Nom d'utilisateur</label><input value={newAccount.username} onChange={e => setNewAccount({ ...newAccount, username: e.target.value })} placeholder="ex : nadia.h" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
            <div className="min-w-[140px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Téléphone</label><input value={newAccount.phone} onChange={e => setNewAccount({ ...newAccount, phone: e.target.value })} placeholder="+213 5XX XX XX XX" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
            <div className="min-w-[130px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Mot de passe</label><input value={newAccount.password} onChange={e => setNewAccount({ ...newAccount, password: e.target.value })} placeholder="Auto si vide" className="w-full border rounded-lg px-3 py-2 outline-none font-mono text-sm" style={{ borderColor: COLORS.line }} /></div>
            <div className="min-w-[170px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Rôle</label>
              <select value={newAccount.role} onChange={e => onRoleFieldChange(e.target.value)} className="w-full border rounded-lg px-2 py-2 outline-none text-sm" style={{ borderColor: COLORS.line }}>
                {roleOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            {(newAccount.role === "president" || newAccount.role === "joueur") && (
              <div className="min-w-[150px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Équipe</label>
                <select value={newAccount.teamId} onChange={e => onTeamFieldChange(e.target.value)} className="w-full border rounded-lg px-2 py-2 outline-none text-sm" style={{ borderColor: COLORS.line }}>
                  <option value="">—</option>{usersEvent.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
            )}
            {newAccount.role === "joueur" && newAccount.teamId !== "" && (
              <div className="min-w-[160px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Joueur</label>
                <select value={newAccount.playerId} onChange={e => setNewAccount({ ...newAccount, playerId: e.target.value })} className="w-full border rounded-lg px-2 py-2 outline-none text-sm" style={{ borderColor: COLORS.line }}>
                  <option value="">—</option>{usersEvent.teams.find(t => t.id === Number(newAccount.teamId))?.players.map(p => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
                </select></div>
            )}
            {(newAccount.role === "superviseur" || newAccount.role === "arbitre") && (
              <label className="flex items-center gap-2 min-w-[170px] text-xs font-semibold cursor-pointer" style={{ color: COLORS.ink }}>
                <input type="checkbox" checked={newAccount.canAuthorize} onChange={e => setNewAccount({ ...newAccount, canAuthorize: e.target.checked })} />
                Droits d'ayant droit<span className="block text-[10px] font-normal text-stone-400">(créer des comptes, valider remboursements)</span>
              </label>
            )}
            <button
              onClick={() => askSaveConfirm(
                "Un compte de connexion sera créé pour cette personne.",
                [
                  { label: "Nom", value: newAccount.name },
                  { label: "E-mail", value: newAccount.email },
                  { label: "Rôle", value: ROLE_LABELS[newAccount.role] },
                  ...(newAccount.teamId !== "" ? [{ label: "Équipe", value: usersEvent.teams.find(t => t.id === Number(newAccount.teamId))?.name }] : []),
                  ...(newAccount.canAuthorize ? [{ label: "Droits", value: "Ayant droit" }] : []),
                ],
                addAccount,
                "Créer le compte"
              )}
              className="h-[42px] px-4 rounded-lg font-semibold text-sm flex items-center gap-1.5 text-white shrink-0" style={{ background: COLORS.turf }}
            ><Plus size={16} />Créer</button>
          </div>
          <p className="text-xs text-stone-400 mt-3">{isFullAdmin ? <>Les comptes Superviseur, Arbitre, Président et Joueur sont rattachés à l'événement actuellement géré : <strong>{managingEvent.settings.name}</strong>. Sélectionner l'équipe d'un coach lui attribue directement son dossier (effectif, remplacements, compositions).</> : "Sélectionner une équipe attribue automatiquement son dossier au compte créé."}</p>
        </div>
        <div className="space-y-2">
          {visibleAccounts.map(acc => (
            <div key={acc.id} className="bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ borderColor: COLORS.line }}>
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar name={acc.name} photo={null} size={36} />
                <div className="min-w-0"><div className="font-semibold text-sm truncate" style={{ color: COLORS.ink }}>{acc.name} {acc.id === currentUser.id && <span className="text-[10px] text-stone-400 font-normal">(vous)</span>}</div>
                  <div className="text-xs text-stone-400 truncate">{acc.email}{acc.eventId && ` · ${events.find(e => e.id === acc.eventId)?.settings.name || "événement supprimé"}`}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {isFullAdmin ? (
                  <select value={acc.role} onChange={e => updateAccountRole(acc.id, e.target.value)} className="text-[11px] font-bold uppercase px-2 py-1.5 rounded-lg border outline-none" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf, borderColor: "rgba(31,110,67,0.25)" }}>
                    {Object.entries(ROLE_LABELS).filter(([k]) => k !== "super_admin" || currentUser.role === "super_admin").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                ) : (
                  <span className="text-[10px] font-bold uppercase px-2 py-1.5 rounded-full" style={{ background: "rgba(31,110,67,0.1)", color: COLORS.turf }}>{ROLE_LABELS[acc.role]}</span>
                )}
                {acc.role === "president" && isFullAdmin && (
                  <select value={acc.teamId ?? ""} onChange={e => updateAccountTeam(acc.id, e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border outline-none" style={{ borderColor: COLORS.line }}>
                    <option value="">Équipe —</option>{(events.find(e => e.id === acc.eventId)?.teams || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                {acc.role === "president" && !isFullAdmin && (
                  <span className="text-xs text-stone-400">{(events.find(e => e.id === acc.eventId)?.teams || []).find(t => t.id === acc.teamId)?.name || "aucune équipe"}</span>
                )}
                {isFullAdmin && (acc.role === "superviseur" || acc.role === "arbitre") && (
                  <button onClick={() => toggleAuthorize(acc.id)} title="Autoriser à créer des comptes et valider les remboursements" className="text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg border" style={{ background: acc.canAuthorize ? "rgba(245,166,35,0.15)" : "transparent", color: acc.canAuthorize ? COLORS.amber : "#9c9686", borderColor: acc.canAuthorize ? COLORS.amber : COLORS.line }}>
                    {acc.canAuthorize ? "Ayant droit ✓" : "Ayant droit"}
                  </button>
                )}
                <button onClick={() => askSaveConfirm(acc.suspended ? `Le compte ${acc.name} sera réactivé.` : `Le compte ${acc.name} sera suspendu — il ne pourra plus se connecter.`, [], () => suspendAccount(acc.id, !acc.suspended), acc.suspended ? "Réactiver" : "Suspendre")} disabled={acc.id === currentUser.id} title={acc.suspended ? "Réactiver" : "Suspendre"} className={`text-stone-300 hover:text-amber-600 disabled:opacity-20 disabled:hover:text-stone-300 ${acc.suspended ? "text-amber-600" : ""}`}><Ban size={15} /></button>
                <button onClick={() => askDeleteConfirm(`le compte ${acc.name}`, () => removeAccount(acc.id))} disabled={acc.id === currentUser.id} className="text-stone-300 hover:text-red-700 disabled:opacity-20 disabled:hover:text-stone-300"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function RefundsView() {
    const isCoach = currentUser.role === "president";
    const canDecide = isFullAdmin || currentUser.canAuthorize;
    const myTeam = isCoach ? teamById[currentUser.teamId] : null;
    const requests = activeEvent.refundRequests || [];
    const [selectedPlayers, setSelectedPlayers] = useState([]);
    const [reason, setReason] = useState("");

    function togglePlayer(pid) { setSelectedPlayers(sel => sel.includes(pid) ? sel.filter(x => x !== pid) : [...sel, pid]); }
    function submit() {
      if (!myTeam || selectedPlayers.length === 0 || !reason.trim()) return;
      submitRefundRequest(myTeam.id, selectedPlayers, reason.trim());
      setSelectedPlayers([]); setReason("");
    }

    const list = isCoach ? requests.filter(r => r.teamId === myTeam?.id) : requests;

    return (
      <div className="max-w-3xl">
        <SectionTitle eyebrow={activeEvent.settings.name} title="Remboursements" count={`${list.length} demande(s)`} />
        {isCoach && myTeam && (
          <div className="bg-white rounded-2xl border p-5 mb-6" style={{ borderColor: COLORS.line }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Nouvelle demande</div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-3">
              {myTeam.players.map(p => (
                <button key={p.id} onClick={() => togglePlayer(p.id)} className="flex flex-col items-center gap-1 p-1.5 rounded-lg border" style={{ borderColor: selectedPlayers.includes(p.id) ? COLORS.turf : COLORS.line, background: selectedPlayers.includes(p.id) ? "rgba(31,110,67,0.08)" : "white" }}>
                  <PlayerAvatar name={p.name} photo={p.photo} size={30} /><span className="text-[9px] leading-tight">#{p.number}</span>
                </button>
              ))}
            </div>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif de la demande (ex : joueur blessé non aligné, frais engagés...)" rows={3} className="w-full border rounded-lg px-3 py-2 text-sm mb-3 outline-none" style={{ borderColor: COLORS.line }} />
            <button
              onClick={() => askSaveConfirm(
                "Cette demande sera envoyée aux ayants droit pour validation.",
                [
                  { label: "Joueurs concernés", value: myTeam.players.filter(p => selectedPlayers.includes(p.id)).map(p => p.name).join(", ") },
                  { label: "Motif", value: reason.trim() },
                ],
                submit,
                "Envoyer la demande"
              )}
              disabled={selectedPlayers.length === 0 || !reason.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: COLORS.turf }}
            >Envoyer la demande</button>
          </div>
        )}
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">{isCoach ? "Mes demandes" : "Demandes reçues"}</div>
        {list.length === 0 && <p className="text-sm text-stone-400">Aucune demande pour le moment.</p>}
        <div className="space-y-2">
          {list.map(r => {
            const team = teamById[r.teamId] || (events.flatMap(e => e.teams)).find(t => t.id === r.teamId);
            const names = (team?.players || []).filter(p => r.playerIds.includes(p.id)).map(p => p.name).join(", ");
            const statusColor = r.status === "pending" ? { bg: "rgba(245,166,35,0.15)", c: COLORS.amber } : r.status === "approved" ? { bg: "rgba(31,110,67,0.1)", c: COLORS.turf } : { bg: "rgba(180,67,43,0.1)", c: "#B4432B" };
            const statusLabel = r.status === "pending" ? "En attente" : r.status === "approved" ? "Validée" : "Invalidée";
            return (
              <div key={r.id} className="bg-white rounded-xl border p-4" style={{ borderColor: COLORS.line }}>
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{team?.name}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-full" style={{ background: statusColor.bg, color: statusColor.c }}>{statusLabel}</span>
                </div>
                <div className="text-xs text-stone-500 mb-1">{names}</div>
                <p className="text-sm" style={{ color: COLORS.ink }}>{r.reason}</p>
                {canDecide && r.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => decideRefundRequest(r.id, "approved")} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: COLORS.turf }}><UserCheck size={13} />Valider</button>
                    <button onClick={() => decideRefundRequest(r.id, "rejected")} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#B4432B" }}><UserX size={13} />Invalider</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function TeamRegistrationForm() {
    const canSubmit = newTeam.name.trim() && newTeam.coachName.trim() && newTeam.coachPhone.trim() && (!settings.requireTeamLogo || newTeam.logo);
    return (
      <div className="flex flex-wrap gap-3 items-end">
        {settings.requireTeamLogo && !newTeam.logo && (
          <p className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mb-1">Le logo est obligatoire pour cet événement — clique sur le blason ci-dessous pour l'importer.</p>
        )}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div onClick={() => fileRef.current?.click()} className="cursor-pointer"><Badge name={newTeam.name || "?"} logo={newTeam.logo} size={48} /></div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleLogoFile(e, logo => setNewTeam({ ...newTeam, logo }))} />
          <span className="text-[10px] text-stone-400 flex items-center gap-0.5"><Upload size={10} />logo{settings.requireTeamLogo && <span className="text-red-500">*</span>}</span>
        </div>
        <div className="flex-1 min-w-[160px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Nom de l'équipe</label><input value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} placeholder="FC Exemple" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
        <div className="flex-1 min-w-[130px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Localité</label><input value={newTeam.city} onChange={e => setNewTeam({ ...newTeam, city: e.target.value })} placeholder="Ville" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
        <div className="flex-1 min-w-[170px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Nom complet du coach</label><input value={newTeam.coachName} onChange={e => setNewTeam({ ...newTeam, coachName: e.target.value })} placeholder="Prénom Nom" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
        <div className="flex-1 min-w-[150px]"><label className="block text-xs font-semibold uppercase tracking-wide text-stone-500 mb-1">Téléphone du coach</label><input value={newTeam.coachPhone} onChange={e => setNewTeam({ ...newTeam, coachPhone: e.target.value })} placeholder="+213 5XX XX XX XX" className="w-full border rounded-lg px-3 py-2 outline-none" style={{ borderColor: COLORS.line }} /></div>
        <button
          onClick={() => askSaveConfirm(
            "Cette équipe sera ajoutée au tournoi.",
            [
              { label: "Nom de l'équipe", value: newTeam.name },
              { label: "Localité", value: newTeam.city },
              { label: "Coach", value: newTeam.coachName },
              { label: "Téléphone", value: newTeam.coachPhone },
            ],
            addTeam,
            "Inscrire l'équipe"
          )}
          disabled={!canSubmit}
          className="h-[42px] px-4 rounded-lg font-semibold text-sm flex items-center gap-1.5 text-white disabled:opacity-40 shrink-0" style={{ background: COLORS.turf }}
        ><Plus size={16} /> Inscrire</button>
      </div>
    );
  }

  function TeamsView() {
    const isPresident = currentUser.role === "president";
    const canManageAll = currentUser.role === "admin" || currentUser.role === "super_admin";
    const myTeam = isPresident ? teamById[currentUser.teamId] : null;

    if (isPresident && !myTeam) {
      return (
        <div className="max-w-lg">
          <SectionTitle eyebrow={`Président / Coach — ${activeEvent.settings.name}`} title="Inscrire mon équipe" />
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: COLORS.line }}>{TeamRegistrationForm()}</div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl">
        <SectionTitle eyebrow={(isPresident ? "Président / Coach" : "Admin") + ` — ${activeEvent.settings.name}`} title={isPresident ? "Mon équipe" : "Inscription des équipes"} count={canManageAll ? `${teams.length} équipes` : undefined} />
        {canManageAll && (
          <div className="bg-white rounded-2xl border p-5 mb-6" style={{ borderColor: COLORS.line }}>
            {TeamRegistrationForm()}
            <p className="text-xs text-stone-400 mt-2">Sans logo, un blason est généré automatiquement à partir des initiales de l'équipe.</p>
          </div>
        )}
        {tournamentLaunched && !settings.allowTeamRemovalAfterLaunch && canManageAll && (
          <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4"><Ban size={13} />Le tournoi est lancé : le retrait d'équipe est verrouillé (modifiable dans Configuration).</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {(isPresident ? [myTeam] : teams).map(t => (
            <div key={t.id} className="bg-white rounded-xl border p-4 flex items-center gap-3" style={{ borderColor: t.suspended ? "#f0b0b0" : COLORS.line, opacity: t.suspended ? 0.6 : 1 }}>
              <Badge name={t.name} logo={t.logo} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate flex items-center gap-1.5" style={{ color: COLORS.ink }}>{t.name}{t.suspended && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700">Suspendue</span>}</div>
                <div className="text-xs text-stone-500 truncate">{t.city} · {t.players.length} joueurs</div>
                {t.coachName && <div className="text-xs text-stone-400 truncate flex items-center gap-1"><User size={11} />{t.coachName}{t.coachPhone && <span className="flex items-center gap-0.5 ml-1"><Phone size={11} />{t.coachPhone}</span>}</div>}
                <button onClick={() => setTeamLicensesView(t)} className="text-[10px] font-mono mt-1 px-1.5 py-0.5 rounded" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>{t.players.length} licences →</button>
              </div>
              {canManageAll && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => askSaveConfirm(t.suspended ? `L'équipe ${t.name} sera réactivée.` : `L'équipe ${t.name} sera suspendue — elle n'apparaîtra plus comme active tant que la suspension n'est pas levée.`, [], () => suspendTeam(t.id, !t.suspended), t.suspended ? "Réactiver" : "Suspendre")} title={t.suspended ? "Réactiver l'équipe" : "Suspendre l'équipe"} className="text-stone-300 hover:text-amber-600"><Ban size={16} /></button>
                  <button onClick={() => askDeleteConfirm(`l'équipe ${t.name}`, () => removeTeam(t.id))} disabled={tournamentLaunched && !settings.allowTeamRemovalAfterLaunch} title={tournamentLaunched && !settings.allowTeamRemovalAfterLaunch ? "Retrait verrouillé après lancement" : "Retirer l'équipe"} className="text-stone-300 hover:text-red-700 disabled:opacity-20 disabled:hover:text-stone-300"><Trash2 size={16} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
        {isPresident && myTeam && (
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: COLORS.line }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Effectif ({myTeam.players.length})</div>
              <span className="text-[10px] text-stone-400">Étoile = capitaine · clique le numéro de licence pour voir la carte</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase text-stone-400 border-b" style={{ borderColor: COLORS.line }}>
                    <th className="text-left px-2 py-1.5">Joueur</th><th className="px-2">Poids (kg)</th><th className="px-2">Taille (cm)</th><th className="px-2">Cap.</th><th className="px-2">Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {myTeam.players.map(p => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer shrink-0">
                            <PlayerAvatar name={p.name} photo={p.photo} size={30} />
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleLogoFile(e, photo => updatePlayerPhoto(myTeam.id, p.id, photo))} />
                          </label>
                          <input value={p.name} onChange={e => updatePlayerField(myTeam.id, p.id, "name", e.target.value)} className="text-sm font-medium border-b border-transparent hover:border-stone-200 outline-none bg-transparent min-w-0 w-24" />
                          <span className="text-xs text-stone-400 shrink-0">#{p.number}</span>
                        </div>
                      </td>
                      <td className="px-2"><input type="number" value={p.weight ?? ""} onChange={e => updatePlayerField(myTeam.id, p.id, "weight", e.target.value ? Number(e.target.value) : null)} placeholder="—" className="w-16 border rounded px-1.5 py-1 text-xs text-center" style={{ borderColor: COLORS.line }} /></td>
                      <td className="px-2"><input type="number" value={p.height ?? ""} onChange={e => updatePlayerField(myTeam.id, p.id, "height", e.target.value ? Number(e.target.value) : null)} placeholder="—" className="w-16 border rounded px-1.5 py-1 text-xs text-center" style={{ borderColor: COLORS.line }} /></td>
                      <td className="px-2 text-center">
                        <button onClick={() => setCaptain(myTeam.id, myTeam.captainId === p.id ? null : p.id)} title="Désigner comme capitaine">
                          <Star size={15} fill={myTeam.captainId === p.id ? COLORS.amber : "none"} style={{ color: myTeam.captainId === p.id ? COLORS.amber : "#d6d0c0" }} />
                        </button>
                      </td>
                      <td className="px-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setLicenseView({ team: myTeam, player: p })} className="text-[11px] font-mono px-2 py-1 rounded-md" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>{p.license || "—"}</button>
                          {canManageAll && <button onClick={() => suspendPlayer(myTeam.id, p.id, !p.manuallySuspended)} title={p.manuallySuspended ? "Réactiver le joueur" : "Suspendre le joueur"} className={p.manuallySuspended ? "text-red-600" : "text-stone-300 hover:text-amber-600"}><Ban size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  function DrawView() {
    const canManageAll = currentUser.role === "admin" || currentUser.role === "super_admin";
    const remainder = settings.poolSize > 0 ? teams.length % settings.poolSize : 0;
    const isUneven = remainder !== 0 && teams.length > settings.poolSize;
    const STRATEGY_OPTIONS = [
      { id: "balance", label: "Compléter en répartissant sur les autres poules", hint: "Le reliquat d'équipes est réparti pour équilibrer toutes les poules (comportement par défaut)." },
      { id: "newPool", label: "Créer une nouvelle poule réduite", hint: "Le reliquat forme sa propre poule, même avec moins d'équipes que les autres." },
      { id: "waitlist", label: "Mettre le reliquat en liste d'attente", hint: "Seules les poules complètes sont créées ; les équipes en trop restent en attente d'affectation manuelle." },
    ];
    const poolOptions = Object.keys(pools || {});
    return (
      <div>
        <SectionTitle eyebrow={`Admin — ${activeEvent.settings.name}`} title="Tirage au sort & calendrier" />
        {!pools ? (
          <div className="bg-white rounded-2xl border p-10 text-center max-w-xl" style={{ borderColor: COLORS.line }}>
            <Trophy size={28} className="mx-auto mb-3" style={{ color: COLORS.amber }} />
            <p className="text-sm text-stone-600 mb-5">{teams.length} équipes inscrites, prêtes pour la répartition en poules de {settings.poolSize} et l'injection automatique dans les créneaux pré-programmés ({SLOTS.length} créneaux disponibles). Une fois lancé, l'événement sera automatiquement publié sur le Dashboard public.</p>
            {isUneven && (
              <div className="text-left mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 mb-2"><AlertTriangle size={13} />{teams.length} équipes ne se divisent pas exactement par {settings.poolSize} — que faire du reliquat ?</div>
                <div className="space-y-2">
                  {STRATEGY_OPTIONS.map(opt => (
                    <label key={opt.id} className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="drawStrategy" checked={drawStrategy === opt.id} onChange={() => setDrawStrategy(opt.id)} className="mt-0.5" />
                      <span><span className="text-sm font-semibold block" style={{ color: COLORS.ink }}>{opt.label}</span><span className="text-xs text-stone-500">{opt.hint}</span></span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => askSaveConfirm(
                "Le tirage au sort répartira les équipes en poules et publiera l'événement sur le Dashboard public.",
                [{ label: "Équipes inscrites", value: `${teams.length}` }, { label: "Équipes par poule", value: `${settings.poolSize}` }, ...(isUneven ? [{ label: "Stratégie reliquat", value: STRATEGY_OPTIONS.find(o => o.id === drawStrategy)?.label }] : [])],
                () => runDraw(drawStrategy),
                "Lancer le tirage au sort"
              )}
              disabled={teams.length < 2}
              className="px-5 py-2.5 rounded-lg font-semibold text-sm text-white disabled:opacity-40" style={{ background: COLORS.pitch }}
            >Lancer le tirage au sort automatique</button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"><CheckCircle2 size={13} />Cet événement est publié sur le Dashboard public.</div>

            {canManageAll && (
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: COLORS.line }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Ajuster les poules manuellement</div>
                  <button type="button" onClick={addEmptyPool} className="text-xs font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5" style={{ borderColor: COLORS.line, color: COLORS.turf }}><Plus size={13} />Nouvelle poule vide</button>
                </div>
                <p className="text-[11px] text-stone-400 mb-3">Déplacer une équipe régénère le calendrier de la poule d'origine et de la poule de destination (les résultats déjà enregistrés dans ces poules seront réinitialisés).</p>
                <div className="space-y-2">
                  {poolOptions.map(poolName => (pools[poolName] || []).map(id => teamById[id] && (
                    <div key={id} className="flex items-center gap-2 text-sm p-2 rounded-lg border" style={{ borderColor: COLORS.line }}>
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: COLORS.turf }}>{poolName}</span>
                      <span className="flex-1 min-w-0 truncate">{teamById[id].name}</span>
                      <select value={poolName} onChange={e => e.target.value !== poolName && moveTeamToPool(id, e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 outline-none bg-white" style={{ borderColor: COLORS.line }}>
                        {poolOptions.map(p => <option key={p} value={p}>Poule {p}</option>)}
                        <option value="_waitlist">Liste d'attente</option>
                      </select>
                    </div>
                  )))}
                </div>
                {poolLeftovers.length > 0 && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: COLORS.line }}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">Liste d'attente ({poolLeftovers.length})</div>
                    <div className="space-y-2">
                      {poolLeftovers.map(id => teamById[id] && (
                        <div key={id} className="flex items-center gap-2 text-sm p-2 rounded-lg border border-amber-200 bg-amber-50">
                          <span className="flex-1 min-w-0 truncate">{teamById[id].name}</span>
                          <select value="" onChange={e => e.target.value && moveTeamToPool(id, e.target.value)} className="text-xs border rounded-lg px-2 py-1.5 outline-none bg-white" style={{ borderColor: COLORS.line }}>
                            <option value="">Assigner à…</option>
                            {poolOptions.map(p => <option key={p} value={p}>Poule {p}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {Object.entries(pools).map(([poolName, ids]) => (
              <div key={poolName}>
                <div className="flex items-center gap-2 mb-3"><span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: COLORS.turf }}>{poolName}</span><span className="font-bold" style={{ color: COLORS.ink }}>Poule {poolName}</span><span className="text-xs text-stone-400">{ids.filter(id => teamById[id]).map(id => teamById[id].name).join(" · ")}</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{matches.filter(m => m.pool === poolName).map(m => <MatchCard key={m.id} m={m} teamById={teamById} onClick={() => { setRefereeMatchId(m.id); setView("referee"); }} />)}</div>
              </div>
            ))}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold" style={{ color: COLORS.ink }}>Phase finale</span>
                {!bracket && (
                  <button
                    onClick={() => askSaveConfirm(
                      matches.every(m => m.status === "done") ? "Tous les matchs de poule sont terminés — la phase finale sera générée à partir du classement actuel." : "Certains matchs de poule ne sont pas encore terminés. La phase finale sera générée à partir du classement actuel, ce qui peut ne pas refléter le classement définitif.",
                      [{ label: "Qualifiés par poule", value: `${settings.qualifiersPerPool}` }],
                      manualGenerateBracket,
                      "Générer la phase finale"
                    )}
                    disabled={teams.length < 2}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: COLORS.pitch }}
                  >Générer la phase finale</button>
                )}
              </div>
              {!bracket ? (
                <p className="text-xs text-stone-400">Se génère automatiquement dès que tous les matchs de poule sont terminés — ou lance-la manuellement ci-dessus.</p>
              ) : (
                <BracketView bracket={bracket} teamById={teamById} onMatchClick={m => { setRefereeMatchId(m.id); setView("referee"); }} />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function RefereeView() {
    const bracketMatches = bracket ? bracket.rounds.flat().filter(m => m.home != null && m.away != null).map(m => ({ ...m, roundLabel: bracket.roundNames[m.round] })) : [];
    const playableMatches = [...matches, ...bracketMatches];
    const match = playableMatches.find(m => m.id === refereeMatchId) || playableMatches[0];
    if (!match) return <EmptyState text="Aucun match programmé. Lancez d'abord le tirage au sort." />;
    const home = teamById[match.home], away = teamById[match.away];
    if (!home || !away) return <EmptyState text="Ce match référence une équipe retirée du tournoi." />;
    const isBracketMatch = match.round !== undefined;
    const isTiedAtEnd = match.homeScore === match.awayScore;

    const homeLineup = match.lineups?.[match.home] || { starters: [], bench: [], validated: false };
    const awayLineup = match.lineups?.[match.away] || { starters: [], bench: [], validated: false };
    const canKickoff = homeLineup.validated && awayLineup.validated;
    const pending = (match.subRequests || []).filter(r => r.status === "pending");
    const [showSheet, setShowSheet] = useState(false);

    function EventButtons({ team, teamId }) {
      const onField = onFieldPlayers(match, teamId, team);
      const [selectedId, setSelectedId] = useState(onField[0]?.id);
      const player = onField.find(p => p.id === selectedId) || onField[0];
      if (!onField.length) return <div className="bg-white rounded-xl border p-4 text-xs text-stone-400" style={{ borderColor: COLORS.line }}>Composition de {team.name} indisponible — faites valider la feuille avant le coup d'envoi.</div>;
      return (
        <div className="bg-white rounded-xl border p-4" style={{ borderColor: COLORS.line }}>
          <div className="flex items-center gap-2 mb-3"><Badge name={team.name} logo={team.logo} size={28} /><span className="font-bold text-sm">{team.name}</span></div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 mb-3">
            {onField.map(p => (
              <button key={p.id} onClick={() => setSelectedId(p.id)} className="flex flex-col items-center gap-1 p-1 rounded-lg border" style={{ borderColor: selectedId === p.id ? COLORS.amber : COLORS.line, background: selectedId === p.id ? "rgba(245,166,35,0.1)" : "white" }}>
                <PlayerAvatar name={p.name} photo={p.photo} size={30} /><span className="text-[9px] leading-tight">#{p.number}</span>
              </button>
            ))}
          </div>
          <div className="text-xs font-medium mb-2 truncate" style={{ color: COLORS.ink }}>{player?.name}</div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => player && addMatchEvent(match.id, "goal", teamId, player)} className="py-2 rounded-lg text-xs font-bold text-white flex flex-col items-center gap-1" style={{ background: COLORS.turf }}><Target size={14} />But</button>
            <button onClick={() => player && addMatchEvent(match.id, "yellow", teamId, player)} className="py-2 rounded-lg text-xs font-bold flex flex-col items-center gap-1" style={{ background: "#F5D876", color: COLORS.ink }}><div className="w-2.5 h-3.5 rounded-sm bg-yellow-400 border border-yellow-600" />Jaune</button>
            <button onClick={() => player && addMatchEvent(match.id, "red", teamId, player)} className="py-2 rounded-lg text-xs font-bold text-white flex flex-col items-center gap-1" style={{ background: "#B4432B" }}><div className="w-2.5 h-3.5 rounded-sm bg-red-600 border border-red-800" />Rouge</button>
          </div>
        </div>
      );
    }

    function PenaltyPicker() {
      const [winner, setWinner] = useState("");
      return (
        <div className="flex items-center gap-2">
          <select value={winner} onChange={e => setWinner(e.target.value)} className="text-xs border rounded-lg px-2 py-2" style={{ borderColor: COLORS.line }}>
            <option value="">Vainqueur T.A.B.</option>
            <option value={match.home}>{home.name}</option>
            <option value={match.away}>{away.name}</option>
          </select>
          <button onClick={() => winner && endMatch(match.id, winner)} disabled={!winner} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40" style={{ background: COLORS.pitch }}><CheckCircle2 size={14} />Terminer</button>
        </div>
      );
    }

    return (
      <div className="max-w-3xl">
        <SectionTitle eyebrow={`Arbitre — ${activeEvent.settings.name}`} title="Feuille de match numérique" />
        <div className="bg-white rounded-2xl border p-5 mb-5" style={{ borderColor: COLORS.line }}>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <select value={match.id} onChange={e => setRefereeMatchId(e.target.value)} className="text-xs font-semibold uppercase tracking-wide text-stone-500 border rounded px-2 py-1" style={{ borderColor: COLORS.line }}>
              {matches.map(m => teamById[m.home] && teamById[m.away] && <option key={m.id} value={m.id}>Poule {m.pool} · {teamById[m.home].name} vs {teamById[m.away].name}</option>)}
              {bracketMatches.map(m => <option key={m.id} value={m.id}>{m.roundLabel} · {teamById[m.home].name} vs {teamById[m.away].name}</option>)}
            </select>
            <button onClick={() => setShowSheet(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(13,40,24,0.06)", color: COLORS.pitch }}><Printer size={13} />Imprimer la feuille de match</button>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="flex items-center gap-2"><Badge name={home.name} logo={home.logo} size={36} /><span className="font-bold">{home.name}</span></div>
            <div className="font-mono font-black text-3xl tabular-nums px-3 py-1 rounded-lg" style={{ background: COLORS.pitch, color: COLORS.amber }}>{match.homeScore} – {match.awayScore}</div>
            <div className="flex items-center gap-2 justify-end"><span className="font-bold">{away.name}</span><Badge name={away.name} logo={away.logo} size={36} /></div>
          </div>

          <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
            <MatchClock clock={match.clock} />
            <div className="flex items-center gap-2 flex-wrap">
              {match.clock.period === "pre" && <button onClick={() => kickoff(match.id)} disabled={!canKickoff} title={!canKickoff ? "Les deux compositions doivent être validées" : ""} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40" style={{ background: COLORS.amber }}><Play size={14} />Coup d'envoi</button>}
              {match.clock.period === "first" && <>
                <button onClick={() => toggleClock(match.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: match.clock.running ? "#B4432B" : COLORS.turf }}>{match.clock.running ? <Pause size={13} /> : <Play size={13} />}{match.clock.running ? "Arrêt de jeu" : "Reprendre"}</button>
                <div className="flex items-center gap-1 text-xs"><span className="text-stone-400">Add. 1èreMT</span><input type="number" min={0} value={match.clock.addedFirst} onChange={e => setAddedTime(match.id, "first", Number(e.target.value))} className="w-12 border rounded px-1 py-1" style={{ borderColor: COLORS.line }} /></div>
                <button onClick={() => goToHalfTime(match.id)} className="px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: COLORS.pitch }}>Fin 1ère MT</button>
              </>}
              {match.clock.period === "half" && <button onClick={() => startSecondHalf(match.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLORS.amber }}><Play size={14} />Coup d'envoi 2e MT</button>}
              {match.clock.period === "second" && <>
                <button onClick={() => toggleClock(match.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: match.clock.running ? "#B4432B" : COLORS.turf }}>{match.clock.running ? <Pause size={13} /> : <Play size={13} />}{match.clock.running ? "Arrêt de jeu" : "Reprendre"}</button>
                <div className="flex items-center gap-1 text-xs"><span className="text-stone-400">Add. 2eMT</span><input type="number" min={0} value={match.clock.addedSecond} onChange={e => setAddedTime(match.id, "second", Number(e.target.value))} className="w-12 border rounded px-1 py-1" style={{ borderColor: COLORS.line }} /></div>
                {isBracketMatch && isTiedAtEnd ? <PenaltyPicker /> : <button onClick={() => endMatch(match.id)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: COLORS.pitch }}><CheckCircle2 size={14} />Terminer le match</button>}
              </>}
              {match.clock.period === "done" && <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-500"><CheckCircle2 size={14} />Match validé</span>}
            </div>
          </div>
        </div>

        {match.clock.period === "pre" && <LineupValidationPanel home={home} away={away} homeId={match.home} awayId={match.away} homeLineup={homeLineup} awayLineup={awayLineup} onValidate={teamId => validateLineup(match.id, teamId)} />}

        {(match.status === "live") && <SubstitutionRequestsPanel pending={pending} teamById={teamById} onRespond={(reqId, decision) => respondSubstitution(match.id, reqId, decision)} />}

        {match.status === "live" && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><EventButtons team={home} teamId={match.home} /><EventButtons team={away} teamId={match.away} /></div>}

        {match.events?.length > 0 && (
          <div className="mt-5 bg-white rounded-xl border p-4" style={{ borderColor: COLORS.line }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Événements</div>
            <div className="space-y-1.5">
              {match.events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-[11px] font-mono text-stone-400 w-9">{ev.minuteLabel}</span>
                  {ev.type === "goal" && <Target size={14} style={{ color: COLORS.turf }} />}
                  {ev.type === "yellow" && <div className="w-2 h-3 rounded-sm bg-yellow-400" />}
                  {ev.type === "red" && <div className="w-2 h-3 rounded-sm bg-red-600" />}
                  {ev.type === "substitution" && <Repeat size={14} style={{ color: COLORS.turf }} />}
                  {ev.type === "substitution" ? (
                    <span className="font-medium">{ev.outPlayerName} <span className="text-stone-400">➜</span> {ev.inPlayerName}</span>
                  ) : (
                    <span className="font-medium">{ev.playerName}{ev.auto && <span className="text-stone-400 font-normal"> (2e jaune)</span>}</span>
                  )}
                  <span className="text-stone-400">— {teamById[ev.teamId]?.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {showSheet && (
          <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowSheet(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4 no-print">
                <h3 className="font-black text-lg" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Feuille de match</h3>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: COLORS.turf }}><Printer size={13} />Imprimer / PDF</button>
                  <button onClick={() => setShowSheet(false)} className="text-stone-400 hover:text-stone-600 text-sm font-semibold">Fermer</button>
                </div>
              </div>
              <div className="print-area"><PrintableMatchSheet match={match} home={home} away={away} teamById={teamById} /></div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function CoachMatchCard({ match, team }) {
    const opponentId = match.home === team.id ? match.away : match.home;
    const opponent = teamById[opponentId];
    const lineup = match.lineups?.[team.id] || { starters: [], bench: [], validated: false };
    const [selected, setSelected] = useState(lineup.starters);
    const isPre = match.clock?.period === "pre";
    const isLive = match.status === "live";
    const isDone = match.status === "done";
    const onField = onFieldPlayers(match, team.id, team);
    const usedSubs = (match.subRequests || []).filter(r => r.teamId === team.id && r.status !== "rejected").length;
    const benchAvailable = team.players.filter(p => !onField.some(f => f.id === p.id));
    const [outId, setOutId] = useState(""), [inId, setInId] = useState("");

    function toggleStarter(pid) { setSelected(sel => sel.includes(pid) ? sel.filter(x => x !== pid) : (sel.length < STARTERS_COUNT ? [...sel, pid] : sel)); }
    function doSubmitLineup() { submitLineup(match.id, team.id, selected, team.players.map(p => p.id)); }
    function doRequestSub() {
      if (!outId || !inId || usedSubs >= settings.subs) return;
      const outP = onField.find(p => p.id === outId), inP = benchAvailable.find(p => p.id === inId);
      if (!outP || !inP) return;
      requestSubstitution(match.id, team.id, outP, inP);
      setOutId(""); setInId("");
    }

    return (
      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: COLORS.line }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><Badge name={opponent?.name || "?"} logo={opponent?.logo} size={28} /><span className="font-bold text-sm">vs {opponent?.name}</span></div>
          <span className="text-xs text-stone-400">{match.field} · {match.time}</span>
        </div>

        {isPre && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Composition ({selected.length}/{STARTERS_COUNT})</div>
            {lineup.validated ? (
              <p className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 size={12} />Composition validée par l'arbitre — modification impossible.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                  {team.players.map(p => (
                    <button key={p.id} onClick={() => toggleStarter(p.id)} className="flex flex-col items-center gap-1 p-1.5 rounded-lg border text-center" style={{ borderColor: selected.includes(p.id) ? COLORS.turf : COLORS.line, background: selected.includes(p.id) ? "rgba(31,110,67,0.08)" : "white" }}>
                      <PlayerAvatar name={p.name} photo={p.photo} size={32} /><span className="text-[10px] leading-tight">#{p.number}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => askSaveConfirm(
                    "Cette composition sera envoyée à l'arbitre pour validation. Elle ne sera plus modifiable une fois validée.",
                    [{ label: "Titulaires sélectionnés", value: team.players.filter(p => selected.includes(p.id)).map(p => `#${p.number}`).join(", ") }],
                    doSubmitLineup,
                    "Soumettre la composition"
                  )}
                  disabled={selected.length !== STARTERS_COUNT}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: COLORS.turf }}
                >Soumettre la composition</button>
                {lineup.starters.length > 0 && !lineup.validated && <p className="text-[11px] text-amber-700 mt-2">En attente de validation par l'arbitre.</p>}
              </>
            )}
          </div>
        )}

        {isLive && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2 flex items-center justify-between"><span>Remplacements</span><span className="text-stone-400 normal-case">{usedSubs}/{settings.subs} utilisés</span></div>
            <div className="flex gap-2 mb-2 flex-wrap">
              <select value={outId} onChange={e => setOutId(e.target.value)} className="flex-1 min-w-[140px] border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: COLORS.line }}>
                <option value="">Joueur à sortir</option>{onField.map(p => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
              </select>
              <select value={inId} onChange={e => setInId(e.target.value)} className="flex-1 min-w-[140px] border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: COLORS.line }}>
                <option value="">Joueur à faire entrer</option>{benchAvailable.map(p => <option key={p.id} value={p.id}>#{p.number} {p.name}</option>)}
              </select>
              <button onClick={doRequestSub} disabled={usedSubs >= settings.subs || !outId || !inId} className="px-3 rounded-lg text-white text-xs font-semibold disabled:opacity-40" style={{ background: COLORS.turf }}>Demander</button>
            </div>
            {(match.subRequests || []).filter(r => r.teamId === team.id).map(r => (
              <div key={r.id} className="text-xs flex items-center justify-between py-1">
                <span>{r.outName} ➜ {r.inName}</span>
                <span className={r.status === "pending" ? "text-amber-700" : r.status === "validated" ? "text-emerald-700" : "text-red-700"}>{r.status === "pending" ? "En attente" : r.status === "validated" ? "Validé" : "Refusé"}</span>
              </div>
            ))}
          </div>
        )}

        {isDone && <div className="text-sm text-stone-500">Match terminé — {match.homeScore} – {match.awayScore}. Remplacements et composition ne sont plus modifiables.</div>}
      </div>
    );
  }

  function CoachMatchesView() {
    const team = teamById[currentUser.teamId];
    if (!team) return <EmptyState text="Aucune équipe rattachée à ce profil." />;
    const myMatches = matches.filter(m => m.home === team.id || m.away === team.id);
    return (
      <div className="max-w-3xl">
        <SectionTitle eyebrow="Président / Coach" title="Mes matchs" />
        {myMatches.length === 0 ? <EmptyState text="Aucun match programmé pour le moment." /> : <div className="space-y-6">{myMatches.map(m => <CoachMatchCard key={m.id} match={m} team={team} />)}</div>}
      </div>
    );
  }

  function SearchView() {
    const q = searchQuery.trim().toLowerCase();
    const searchableEvents = isFullAdmin ? events : events.filter(e => e.id === currentUser.eventId);
    const results = { events: [], teams: [], players: [] };
    if (q.length >= 2) {
      searchableEvents.forEach(ev => {
        if (ev.settings.name.toLowerCase().includes(q)) results.events.push(ev);
        ev.teams.forEach(t => {
          const teamMatch = [t.name, t.city, t.coachName, t.coachPhone].some(v => v && String(v).toLowerCase().includes(q));
          if (teamMatch) results.teams.push({ ev, team: t });
          t.players.forEach(p => {
            const playerMatch = [p.name, p.license, String(p.number)].some(v => v && String(v).toLowerCase().includes(q));
            if (playerMatch) results.players.push({ ev, team: t, player: p });
          });
        });
      });
    }
    const totalResults = results.events.length + results.teams.length + results.players.length;
    return (
      <div className="max-w-2xl">
        <SectionTitle eyebrow={ROLE_LABELS[currentUser.role]} title="Recherche globale" />
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Nom, ville, téléphone, numéro de licence, dossard…" className="w-full border rounded-xl pl-9 pr-3 py-2.5 outline-none" style={{ borderColor: COLORS.line }} autoFocus />
        </div>
        {q.length < 2 ? (
          <EmptyState text="Tape au moins 2 caractères pour rechercher parmi les événements, équipes et joueurs." />
        ) : totalResults === 0 ? (
          <EmptyState text="Aucun résultat pour cette recherche." />
        ) : (
          <div className="space-y-6">
            {results.events.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Événements ({results.events.length})</div>
                <div className="space-y-1.5">{results.events.map(ev => (
                  <button key={ev.id} onClick={() => { setManagingEventId(ev.id); setView("setup"); }} className="w-full text-left flex items-center gap-2 bg-white rounded-lg border p-3" style={{ borderColor: COLORS.line }}><Trophy size={14} className="text-stone-400" /><span className="font-medium text-sm">{ev.settings.name}</span></button>
                ))}</div>
              </div>
            )}
            {results.teams.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Équipes ({results.teams.length})</div>
                <div className="space-y-1.5">{results.teams.map(({ ev, team }) => (
                  <button key={ev.id + "-" + team.id} onClick={() => { setManagingEventId(ev.id); setView("teams"); }} className="w-full text-left flex items-center gap-3 bg-white rounded-lg border p-3" style={{ borderColor: COLORS.line }}>
                    <Badge name={team.name} logo={team.logo} size={28} />
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{team.name}</div><div className="text-xs text-stone-400 truncate">{ev.settings.name} · {team.coachName}{team.coachPhone ? ` · ${team.coachPhone}` : ""}</div></div>
                  </button>
                ))}</div>
              </div>
            )}
            {results.players.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Joueurs ({results.players.length})</div>
                <div className="space-y-1.5">{results.players.map(({ ev, team, player }) => (
                  <button key={ev.id + "-" + team.id + "-" + player.id} onClick={() => setLicenseView({ team, player })} className="w-full text-left flex items-center gap-3 bg-white rounded-lg border p-3" style={{ borderColor: COLORS.line }}>
                    <PlayerAvatar name={player.name} photo={player.photo} size={28} />
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{player.name} <span className="text-stone-400 font-normal">#{player.number}</span></div><div className="text-xs text-stone-400 truncate">{team.name} · {ev.settings.name}</div></div>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(31,110,67,0.08)", color: COLORS.turf }}>{player.license || "—"}</span>
                  </button>
                ))}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function ProfileView() {
    const team = teamById[currentUser.teamId];
    if (!team) return <EmptyState text="Aucune équipe rattachée à ce profil." />;
    const player = team.players.find(p => p.id === currentUser.playerId);
    const myGoals = matches.reduce((n, m) => n + (m.events || []).filter(e => e.playerId === currentUser.playerId && e.type === "goal").length, 0);
    const myYellows = matches.reduce((n, m) => n + (m.events || []).filter(e => e.playerId === currentUser.playerId && e.type === "yellow").length, 0);
    const myReds = matches.reduce((n, m) => n + (m.events || []).filter(e => e.playerId === currentUser.playerId && e.type === "red").length, 0);
    const upcoming = matches.filter(m => (m.home === team.id || m.away === team.id) && m.status === "scheduled");
    if (!settings.showPlayerProfiles) return <EmptyState text="Le profil joueur est désactivé par l'organisateur pour ce tournoi." />;
    return (
      <div className="max-w-2xl">
        <SectionTitle eyebrow={`Joueur — ${activeEvent.settings.name}`} title={player?.name || currentUser.name} />
        <div className="bg-white rounded-2xl border p-6 mb-6 flex items-center gap-4" style={{ borderColor: COLORS.line }}>
          <PlayerAvatar name={player?.name || currentUser.name} photo={player?.photo} size={56} />
          <div><div className="font-bold text-lg" style={{ color: COLORS.ink }}>{team.name}</div><div className="text-sm text-stone-500">Numéro {player?.number}</div></div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border p-4 text-center" style={{ borderColor: COLORS.line }}><div className="text-2xl font-mono font-black" style={{ color: COLORS.turf }}>{myGoals}</div><div className="text-xs text-stone-500 mt-1">Buts</div></div>
          <div className="bg-white rounded-xl border p-4 text-center" style={{ borderColor: COLORS.line }}><div className="text-2xl font-mono font-black text-yellow-600">{myYellows}</div><div className="text-xs text-stone-500 mt-1">Cartons jaunes</div></div>
          <div className="bg-white rounded-xl border p-4 text-center" style={{ borderColor: COLORS.line }}><div className="text-2xl font-mono font-black text-red-700">{myReds}</div><div className="text-xs text-stone-500 mt-1">Cartons rouges</div></div>
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">Prochains matchs</div>
        <div className="grid grid-cols-1 gap-3">{upcoming.length === 0 && <p className="text-sm text-stone-400">Aucun match à venir pour le moment.</p>}{upcoming.map(m => <MatchCard key={m.id} m={m} teamById={teamById} onClick={() => {}} />)}</div>
      </div>
    );
  }

  /* ---------- PUBLIC MULTI-EVENT DASHBOARD ---------- */

  function EventsListPublic() {
    const launched = events.filter(e => e.pools !== null && !e.suspended && (currentUser || e.settings.publicAccess !== false)).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return (
      <div>
        <SectionTitle eyebrow="Dashboard public" title="Tous les événements" count={`${launched.length} publié(s)`} />
        {launched.length === 0 ? <EmptyState text="Aucun événement publié pour le moment. Un tournoi apparaît ici dès que son tirage au sort est lancé." /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {launched.map(ev => {
              const played = ev.matches.filter(m => m.status === "done").length;
              return (
                <button key={ev.id} onClick={() => { setDashboardEventId(ev.id); setDashboardTab("programme"); }} className="text-left bg-white rounded-2xl border p-6 hover:shadow-lg transition-shadow" style={ev.pinned ? { borderColor: COLORS.amber, boxShadow: `0 0 0 1px ${COLORS.amber}` } : { borderColor: COLORS.line }}>
                  <div className="flex items-center justify-between mb-4"><StatusPill ev={ev} />{ev.pinned ? <Star size={16} fill={COLORS.amber} style={{ color: COLORS.amber }} /> : <Trophy size={16} className="text-stone-300" />}</div>
                  <h3 className="text-xl font-black mb-1" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>{ev.settings.name}</h3>
                  <p className="text-xs text-stone-500 mb-4">{ev.teams.length} équipes · {Object.keys(ev.pools || {}).length} poules</p>
                  <div className="text-xs text-stone-400">{played}/{ev.matches.length} matchs joués</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function EventDetailPublic({ ev }) {
    if (!currentUser && ev.settings.publicAccess === false) {
      return <EmptyState text="Cet événement n'est pas accessible sans connexion. Contacte l'administrateur du tournoi." />;
    }
    const tb = Object.fromEntries(ev.teams.map(t => [t.id, t]));
    const standings = computeStandingsForEvent(ev);
    const scorers = computeTopScorersForEvent(ev);
    const suspended = computeSuspendedForEvent(ev);
    const [posterPool, setPosterPool] = useState(null);
    const [posterCfg, setPosterCfg] = useState({ slogan: "Le fair-play avant tout", location: "", instagram: "", facebook: "", accent: "#F5A623" });
    const [printMode, setPrintMode] = useState(null); // 'schedule' | 'bracket'
    return (
      <div>
        <button onClick={() => setDashboardEventId(null)} className="flex items-center gap-1 text-xs font-semibold text-stone-500 mb-4 hover:text-stone-700"><ChevronLeft size={14} />Tous les événements</button>
        <SectionTitle eyebrow="Dashboard public" title={ev.settings.name} count={`${ev.matches.filter(m => m.status === "done").length}/${ev.matches.length} matchs joués`} />
        <LiveMatchHero ev={ev} />
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3 border-b" style={{ borderColor: COLORS.line }}>
          <div className="flex gap-1">
            {[["programme", "Programme"], ["standings", "Classement"], ["scorers", "Buteurs & cartons"], ["bracket", "Phase finale"]].map(([id, label]) => (
              <button key={id} onClick={() => setDashboardTab(id)} className="px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors" style={{ borderColor: dashboardTab === id ? COLORS.turf : "transparent", color: dashboardTab === id ? COLORS.turf : "#9c9686" }}>{label}</button>
            ))}
          </div>
          {isFullAdmin && (
            <button onClick={() => setPrintMode(dashboardTab === "bracket" ? "bracket" : "schedule")} className="mb-2 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "rgba(13,40,24,0.06)", color: COLORS.pitch }}>
              <Printer size={13} />{dashboardTab === "bracket" ? "Imprimer le tableau" : "Imprimer le calendrier"}
            </button>
          )}
        </div>
        {dashboardTab === "programme" && (ev.matches.length === 0 ? <EmptyState text="Aucun match programmé pour le moment." /> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{ev.matches.map(m => <MatchCard key={m.id} m={m} teamById={tb} onClick={() => {}} />)}</div>)}
        {dashboardTab === "standings" && (Object.keys(standings).length === 0 ? <EmptyState text="Classement indisponible." /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(standings).map(([poolName, table]) => (
              <div key={poolName} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: COLORS.line }}>
                <div className="px-4 py-2.5 flex items-center justify-between text-sm text-white" style={{ background: COLORS.pitch }}>
                  <span className="font-bold">Poule {poolName}</span>
                  {isFullAdmin && (
                    <button onClick={() => setPosterPool(poolName)} className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ background: "rgba(245,166,35,0.25)", color: COLORS.amber }}>
                      Export visuel
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-[11px] uppercase text-stone-400 border-b" style={{ borderColor: COLORS.line }}><th className="text-left px-3 py-1.5">Équipe</th><th className="px-1.5">J</th><th className="px-1.5">V</th><th className="px-1.5">N</th><th className="px-1.5">D</th><th className="px-1.5">Diff</th><th className="px-2 font-bold">Pts</th></tr></thead>
                  <tbody>{table.map((row, idx) => tb[row.id] && (
                    <tr key={row.id} className={idx < 2 ? "" : "text-stone-400"} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                      <td className="px-3 py-1.5 flex items-center gap-1.5 font-medium whitespace-nowrap"><Badge name={tb[row.id].name} logo={tb[row.id].logo} size={20} />{tb[row.id].name}</td>
                      <td className="text-center">{row.played}</td><td className="text-center">{row.w}</td><td className="text-center">{row.d}</td><td className="text-center">{row.l}</td>
                      <td className="text-center">{row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}</td><td className="text-center font-mono font-bold" style={{ color: COLORS.turf }}>{row.pts}</td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </div>
            ))}
          </div>
        ))}
        {posterPool && (
          <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPosterPool(null)}>
            <div className="bg-white rounded-2xl p-6 max-w-3xl w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-lg" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>Export visuel — Poule {posterPool}</h3>
                <button onClick={() => setPosterPool(null)} className="text-stone-400 hover:text-stone-600 text-sm font-semibold">Fermer</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <input value={posterCfg.slogan} onChange={e => setPosterCfg({ ...posterCfg, slogan: e.target.value })} placeholder="Slogan" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: COLORS.line }} />
                <input value={posterCfg.location} onChange={e => setPosterCfg({ ...posterCfg, location: e.target.value })} placeholder="Lieu" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: COLORS.line }} />
                <input value={posterCfg.instagram} onChange={e => setPosterCfg({ ...posterCfg, instagram: e.target.value })} placeholder="@instagram (optionnel)" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: COLORS.line }} />
                <input value={posterCfg.facebook} onChange={e => setPosterCfg({ ...posterCfg, facebook: e.target.value })} placeholder="Page Facebook (optionnel)" className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: COLORS.line }} />
                <label className="flex items-center gap-2 text-sm text-stone-500 md:col-span-2">Couleur d'accent
                  <input type="color" value={posterCfg.accent} onChange={e => setPosterCfg({ ...posterCfg, accent: e.target.value })} className="w-8 h-8 rounded border" style={{ borderColor: COLORS.line }} />
                </label>
              </div>
              <div className="overflow-x-auto">
                <ClassementPoster
                  poolName={`Poule ${posterPool}`}
                  eventName={ev.settings.name}
                  theme={{ primary: COLORS.pitch, accent: posterCfg.accent }}
                  slogan={posterCfg.slogan}
                  location={posterCfg.location}
                  socials={{ instagram: posterCfg.instagram, facebook: posterCfg.facebook }}
                  teams={standings[posterPool].filter(row => tb[row.id]).map((row, i) => ({
                    rank: i + 1, name: tb[row.id].name, logo: tb[row.id].logo,
                    mj: row.played, bt: row.gf, be: row.ga, gd: row.gf - row.ga, pts: row.pts,
                  }))}
                />
              </div>
            </div>
          </div>
        )}
        {dashboardTab === "scorers" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {ev.settings.showTopScorers && (
              <div className="bg-white rounded-xl border p-4" style={{ borderColor: COLORS.line }}>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3 flex items-center gap-1.5"><Award size={13} style={{ color: COLORS.amber }} />Meilleurs buteurs</div>
                {scorers.length === 0 && <p className="text-sm text-stone-400">Aucun but inscrit pour le moment.</p>}
                {scorers.map((s, i) => (
                  <div key={s.playerId} className="flex items-center justify-between py-1.5 text-sm" style={{ borderTop: i > 0 ? `1px solid ${COLORS.line}` : "none" }}>
                    <span className="flex items-center gap-2"><span className="text-stone-400 w-4">{i + 1}</span>{s.playerName} <span className="text-stone-400">— {tb[s.teamId]?.name}</span></span>
                    <span className="font-mono font-bold" style={{ color: COLORS.turf }}>{s.goals}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: COLORS.line }}>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3 flex items-center gap-1.5"><AlertTriangle size={13} style={{ color: COLORS.amber }} />Joueurs suspendus</div>
              {suspended.length === 0 && <p className="text-sm text-stone-400">Aucun joueur suspendu.</p>}
              {suspended.map((p, i) => (
                <div key={i} className="text-sm flex items-center justify-between py-1.5" style={{ borderTop: i > 0 ? `1px solid ${COLORS.line}` : "none" }}>
                  <span>{p.playerName} <span className="text-stone-400">— {tb[p.teamId]?.name}</span></span><span className="text-xs text-red-700 font-medium">{p.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {dashboardTab === "bracket" && (
          !ev.bracket ? <EmptyState text="La phase finale n'a pas encore été générée. Elle apparaît automatiquement une fois tous les matchs de poule terminés." /> :
          <BracketView bracket={ev.bracket} teamById={tb} />
        )}
        {printMode && (
          <div className="fixed inset-0 z-30 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPrintMode(null)}>
            <div className="bg-white rounded-2xl p-6 max-w-3xl w-full" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4 no-print">
                <h3 className="font-black text-lg" style={{ color: COLORS.ink, fontFamily: "'Barlow Condensed', sans-serif" }}>{printMode === "bracket" ? "Tableau de phase finale" : "Calendrier du tournoi"}</h3>
                <div className="flex gap-2">
                  <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: COLORS.turf }}><Printer size={13} />Imprimer / PDF</button>
                  <button onClick={() => setPrintMode(null)} className="text-stone-400 hover:text-stone-600 text-sm font-semibold">Fermer</button>
                </div>
              </div>
              <div className="print-area">
                {printMode === "bracket"
                  ? <PrintableBracket bracket={ev.bracket} teamById={tb} eventName={ev.settings.name} />
                  : <PrintableSchedule ev={ev} teamById={tb} />}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function PublicDashboardView() {
    const ev = dashboardEventId ? events.find(e => e.id === dashboardEventId) : null;
    if (ev) return EventDetailPublic({ ev });
    return <EventsListPublic />;
  }

  /* ---------- render ---------- */

  if (!authChecked) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: COLORS.chalk, fontFamily: "'Inter', sans-serif" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3 animate-pulse" style={{ background: COLORS.amber }}><Trophy size={20} style={{ color: COLORS.pitch }} /></div>
          <div className="font-black text-sm uppercase tracking-wide" style={{ color: COLORS.turf, fontFamily: "'Barlow Condensed', sans-serif" }}>Vérification de la session…</div>
        </div>
      </div>
    );
  }

  if (publicMode && !currentUser) {
    return (
      <div className="min-h-screen w-full" style={{ background: COLORS.chalk, fontFamily: "'Inter', sans-serif" }}>
        <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b bg-white" style={{ borderColor: COLORS.line }}>
          <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: COLORS.amber }}><Trophy size={16} style={{ color: COLORS.pitch }} /></div><div className="font-black text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>TourneyOS</div></div>
          <button onClick={() => setPublicMode(false)} className="text-sm font-semibold px-4 py-2 rounded-lg text-white flex items-center gap-1.5" style={{ background: COLORS.pitch }}><Lock size={13} />Se connecter</button>
        </header>
        <main className="p-4 sm:p-6 lg:p-10">{PublicDashboardView()}</main>
      </div>
    );
  }

  if (!firebaseUser) return <LoginScreen loginForm={loginForm} setLoginForm={setLoginForm} onSubmit={handleLogin} onViewPublic={() => setPublicMode(true)} />;

  if (profileMissing) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-8" style={{ background: COLORS.chalk, fontFamily: "'Inter', sans-serif" }}>
        <div className="text-center max-w-sm">
          <AlertTriangle size={24} className="mx-auto mb-3" style={{ color: COLORS.amber }} />
          <p className="text-sm text-stone-600 mb-4">Ce compte est authentifié mais n'a pas encore de profil (rôle) rattaché. Contactez l'administrateur du tournoi pour qu'il vous en attribue un.</p>
          <button onClick={() => signOut(auth)} className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: COLORS.pitch }}>Se déconnecter</button>
        </div>
      </div>
    );
  }

  if (!currentUser) return <LoginScreen loginForm={loginForm} setLoginForm={setLoginForm} onSubmit={handleLogin} onViewPublic={() => setPublicMode(true)} />;

  if (currentUser.suspended) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-8" style={{ background: COLORS.chalk, fontFamily: "'Inter', sans-serif" }}>
        <div className="text-center max-w-sm">
          <Ban size={24} className="mx-auto mb-3" style={{ color: "#b91c1c" }} />
          <p className="text-sm text-stone-600 mb-4">Ce compte a été suspendu par l'administrateur. Contacte-le pour en savoir plus.</p>
          <button onClick={() => signOut(auth)} className="text-sm font-semibold px-4 py-2 rounded-lg text-white" style={{ background: COLORS.pitch }}>Se déconnecter</button>
        </div>
      </div>
    );
  }

  const views = { setup: SetupView, events: EventsView, users: UsersView, teams: TeamsView, coach_match: CoachMatchesView, draw: DrawView, referee: RefereeView, live: PublicDashboardView, refunds: RefundsView, search: SearchView, profile: ProfileView, cards: CardsView };
  const activeViewId = allowedNav.find(n => n.id === view) ? view : allowedNav[0]?.id;
  const ActiveView = views[activeViewId] || (() => <EmptyState text="Aucun accès disponible pour ce rôle." />);

  return (
    <div className="min-h-screen w-full flex" style={{ background: COLORS.chalk, fontFamily: "'Inter', sans-serif" }}>
      {navOpen && <div className="fixed inset-0 bg-black/30 z-10 lg:hidden" onClick={() => setNavOpen(false)} />}
      <aside className={`fixed lg:static z-20 top-0 left-0 h-full w-64 shrink-0 flex flex-col transition-transform ${navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`} style={{ background: COLORS.pitch }}>
        <div className="px-5 py-6 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: COLORS.amber }}><Trophy size={18} style={{ color: COLORS.pitch }} /></div>
          <div><div className="text-white font-black text-lg leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>TourneyOS</div><div className="text-[10px] text-white/40 uppercase tracking-wider">Gestion de tournois</div></div>
        </div>
        {(currentUser.role === "admin" || currentUser.role === "super_admin") && managingEventId && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg" style={{ background: "rgba(245,166,35,0.1)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="text-[9px] uppercase tracking-wide text-white/40">Espace événement</div><div className="text-xs font-bold truncate" style={{ color: COLORS.amber }}>{managingEvent.settings.name}</div></div>
              <button onClick={() => { setManagingEventId(null); setView("events"); setNavOpen(false); }} title="Retour à l'accueil global (Mes événements)" className="shrink-0 text-white/50 hover:text-white"><ChevronLeft size={16} /></button>
            </div>
          </div>
        )}
        {(currentUser.role === "admin" || currentUser.role === "super_admin") && !managingEventId && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="text-[9px] uppercase tracking-wide text-white/40">Accueil global</div><div className="text-xs font-bold text-white/70">Ouvre un événement pour le gérer</div>
          </div>
        )}
        <nav className="flex-1 px-3 space-y-1 mt-1">
          {allowedNav.map(item => {
            const Icon = item.icon; const active = activeViewId === item.id;
            return (
              <button key={item.id} onClick={() => { setView(item.id); setNavOpen(false); if (item.id === "live") setDashboardEventId(null); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors" style={{ background: active ? "rgba(245,166,35,0.15)" : "transparent", color: active ? COLORS.amber : "rgba(255,255,255,0.65)" }}>
                {Icon && <Icon size={16} />}<span className="flex-1 text-left">{item.label}</span>{active && <ChevronRight size={14} />}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-5 border-t border-white/10">
          <div className="text-[10px] text-white/30 uppercase tracking-wide mb-1">Connecté en tant que</div>
          <div className="text-sm text-white/80 font-semibold truncate">{currentUser.name}</div>
          <div className="text-xs text-white/40 mb-3">{ROLE_LABELS[currentUser.role]}</div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white"><LogOut size={13} />Se déconnecter</button>
          <div className="text-[10px] text-white/25 mt-3">Synchronisé en temps réel (Firebase)</div>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b" style={{ borderColor: COLORS.line }}>
          <button onClick={() => setNavOpen(!navOpen)}><Menu size={20} /></button><span className="font-bold text-sm">TourneyOS</span><span className="w-5" />
        </header>
        <main className="p-4 sm:p-6 lg:p-10 overflow-x-hidden">{ActiveView()}</main>
      </div>
      <ConfirmModal modal={confirmModal} onClose={() => setConfirmModal(null)} />
      <LicenseCardModal view={licenseView} eventName={managingEvent.settings.name} onClose={() => setLicenseView(null)} />
      <TeamLicensesModal team={teamLicensesView} eventName={managingEvent.settings.name} onOpenPlayer={p => { setLicenseView({ team: teamLicensesView, player: p }); }} onClose={() => setTeamLicensesView(null)} />
    </div>
  );
}
