import { useState, useEffect, useRef, useCallback } from "react";
import {
  Flame, Target, Clock, TrendingUp, Plus, Minus, RotateCcw,
  Play, Pause, Check, X, ChevronLeft, Dumbbell, ArrowRight,
  LogOut, Users, Globe, Copy, ExternalLink, Search,
  Heart, MessageCircle, Repeat2, Quote, Trash2, Video, Edit3, Activity,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { createClient } from "@supabase/supabase-js";

const projectId = "wnzmsvcimrvmbzmmmixn";
const supabase = createClient(
  `https://${projectId}.supabase.co`,
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Induem1zdmNpbXJ2bWJ6bW1taXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNzEwMDYsImV4cCI6MjA5ODg0NzAwNn0.Pl_uW2lVit3V8dK6P6a8Ym_50vxTvPoFVsVypjqMVXs"
);

// ─── Types ────────────────────────────────────────────────────────────────────
type View = "home" | "training" | "strength" | "community";
type AuthState = "loading" | "unauthenticated" | "needs_profile" | "ready";

interface UserProfile {
  userId: string; firstName: string; lastName: string; email: string;
  role?: "admin" | "player"; avatarUrl?: string;
  position: string; gradYear: string; height: string; weight: string;
  wingspan: string; vertical: string; bio: string; isPublic: boolean;
  strengths: string; weaknesses: string;
}
interface Team {
  id: string; name: string; level: string; description: string; location: string;
  createdBy: string; creatorName: string; members: string[];
  memberProfiles: { userId: string; firstName: string; lastName: string; position: string; }[];
  createdAt: string;
}
interface MiniProfile { firstName: string; lastName: string; position: string; avatarUrl?: string; role?: "admin" | "player"; }
interface PostData {
  id: string; userId: string; content: string;
  videoUrl?: string; videoId?: string;
  replyTo?: string; quotedPostId?: string; quotedPost?: PostData;
  createdAt: string;
  likes: string[]; reposts: string[];
  likeCount: number; repostCount: number; replyCount: number;
  profile?: MiniProfile;
}
interface CommunityPlayer {
  userId: string; profile: UserProfile;
  summary: { streak: number; shootingPct: number; totalMinutes: number; activeDays: number; };
}
interface SessionData { date: string; minutes: number; }
interface ShotEntry { made: number; attempted: number; date: string; }
interface StrengthEntry { date: string; weight: number; reps: number; est1rm?: number; notes?: string; videoUrl?: string; }
interface StrengthExercise { name: string; unit: "lbs" | "kg"; history: StrengthEntry[]; }
interface JumpTestEntry { id: string; date: string; type: "Squat Jump" | "Countermovement Jump" | "Drop Jump"; height: number; contactTime?: number; rsi?: number; notes?: string; }
interface AthleticLifts { powerClean: string; deepBackSquat: string; }
interface TrainingPlanSettings {
  age: string; experience: string; inSeason: boolean; practicesPerWeek: string;
  gamesPerWeek: string; equipment: string; goal: string; kneePain: boolean; notes: string;
}
interface WorkoutBlock { id: string; activity: string; minutes: number; notes?: string; }
interface WorkoutSummary { id: string; date: string; totalMinutes: number; completedMinutes: number; completionPct: number; blocks: WorkoutBlock[]; }
interface AppData {
  streak: number; lastPracticeDate: string;
  shots: ShotEntry[]; sessions: SessionData[];
  strength: StrengthExercise[];
  jumpTests?: JumpTestEntry[];
  athleticLifts?: AthleticLifts;
  trainingPlan?: TrainingPlanSettings;
  workoutPlan?: WorkoutBlock[];
  workoutHistory?: WorkoutSummary[];
}

// ─── Config ───────────────────────────────────────────────────────────────────
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const TEAM_LEVELS = ["Men's League", "High School", "College", "Pro / Overseas", "Club / Recreational"];
const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-4cb0fb87`;
const APP_NAME = "HOOP HUB";
const APP_TAGLINE = "Track your game. Own your grind.";
const ADMIN_EMAILS = ["kingof21kings@gmail.com"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeDate(d: number) { return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); }
function shortDate(iso: string) { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function formatTime(s: number) { return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function lastDays(n: number) { return Array.from({ length: n }, (_, i) => makeDate(n - 1 - i)); }
function sanitizeText(s: string, max = 80) { return s.replace(/\s+/g, " ").trim().slice(0, max); }
function sanitizeImageUrl(url: string) {
  const clean = url.trim();
  if (!clean) return "";
  try {
    const u = new URL(clean);
    return u.protocol === "https:" ? u.toString().slice(0, 500) : "";
  } catch { return ""; }
}
function isAdmin(p?: UserProfile | MiniProfile | null) { return p?.role === "admin"; }
function withRole<T extends { email?: string; role?: "admin" | "player" }>(p: T): T {
  return { ...p, role: p.role === "admin" || ADMIN_EMAILS.includes((p.email || "").toLowerCase()) ? "admin" : "player" };
}
function shootingPct(shots: ShotEntry[]) {
  const m = shots.reduce((a, b) => a + b.made, 0), a = shots.reduce((a, b) => a + b.attempted, 0);
  return a === 0 ? 0 : Math.round((m / a) * 100);
}
function extractYTId(url: string) { const m = url.match(/(?:youtu\.be\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
function isDirectVideoUrl(url?: string) { return !!url && /^https:\/\/.+\.(mp4|webm|mov)(\?.*)?$/i.test(url); }
function verticalFromFlightTime(seconds: number) { return Math.max(0, Math.round(48.26 * seconds * seconds * 10) / 10); }
function est1rm(weight: number, reps: number) { return Math.round(weight * (1 + reps / 30)); }
function uploadPathName(name: string, fallback: string) {
  const ext = (name.split(".").pop() || fallback).toLowerCase().replace(/[^a-z0-9]/g, "") || fallback;
  return `${Date.now()}-${crypto.randomUUID()}.${ext}`;
}
function defaultWorkoutPlan(): WorkoutBlock[] {
  return [
    { id: crypto.randomUUID(), activity: "Ball Handling", minutes: 15, notes: "" },
    { id: crypto.randomUUID(), activity: "Shooting", minutes: 45, notes: "" },
    { id: crypto.randomUUID(), activity: "Finishing", minutes: 15, notes: "" },
    { id: crypto.randomUUID(), activity: "Free Throws", minutes: 10, notes: "" },
  ];
}
async function workoutNotify(title: string, body: string) {
  try {
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch {}
  try { navigator.vibrate?.([250, 80, 250]); } catch {}
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = 880; gain.gain.value = 0.05; osc.connect(gain); gain.connect(ctx.destination); osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 220);
  } catch {}
}
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime(), m = Math.floor(diff / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function defaultStrength(): StrengthExercise[] {
  return [
    { name: "Bench Press", unit: "lbs", history: [] },
    { name: "Squat", unit: "lbs", history: [] },
    { name: "Deadlift", unit: "lbs", history: [] },
    { name: "Overhead Press", unit: "lbs", history: [] },
  ];
}
function emptyTrainingPlan(): TrainingPlanSettings {
  return { age: "15", experience: "Intermediate", inSeason: false, practicesPerWeek: "3", gamesPerWeek: "1", equipment: "Ball, hoop", goal: "Shooting", kneePain: false, notes: "" };
}
function emptyData(): AppData { return { streak: 0, lastPracticeDate: "", shots: [], sessions: [], strength: defaultStrength(), jumpTests: [], athleticLifts: { powerClean: "", deepBackSquat: "" }, trainingPlan: emptyTrainingPlan(), workoutPlan: defaultWorkoutPlan(), workoutHistory: [] }; }
function initials(p?: MiniProfile | null) { return p ? `${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase() : "?"; }

// ─── Rank system ──────────────────────────────────────────────────────────────
const RANKS = [
  { label: "Elite",    hours: 2500, color: "#a855f7", emoji: "💎" },
  { label: "Platinum", hours: 1000, color: "#60a5fa", emoji: "🏆" },
  { label: "Gold",     hours: 500,  color: "#f59e0b", emoji: "🥇" },
  { label: "Silver",   hours: 250,  color: "#94a3b8", emoji: "🥈" },
  { label: "Bronze",   hours: 100,  color: "#c97c3a", emoji: "🥉" },
  { label: "Rookie",   hours: 0,    color: "#8a8680", emoji: "🏀" },
];
function getRank(totalMinutes: number) {
  const hours = totalMinutes / 60;
  return RANKS.find(r => hours >= r.hours) ?? RANKS[RANKS.length - 1];
}
function getNextRank(totalMinutes: number) {
  const hours = totalMinutes / 60;
  const idx = RANKS.findIndex(r => hours >= r.hours);
  return idx > 0 ? RANKS[idx - 1] : null;
}

const GRAD_YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() + i - 1));

// ─── Local Storage (instant, no network) ──────────────────────────────────────
const lsGet = (k: string) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
const lsSet = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const localProfile = (uid: string) => lsGet(`hh_profile_${uid}`);
const localData    = (uid: string) => lsGet(`hh_data_${uid}`);
const saveLocalProfile = (p: UserProfile) => lsSet(`hh_profile_${p.userId}`, p);
const saveLocalData    = (uid: string, d: AppData) => lsSet(`hh_data_${uid}`, d);
const pendingProfile = (uid: string) => lsGet(`hh_pending_profile_${uid}`);
const pendingData    = (uid: string) => lsGet(`hh_pending_data_${uid}`);
const clearPendingProfile = (uid: string) => { try { localStorage.removeItem(`hh_pending_profile_${uid}`); } catch {} };
const clearPendingData    = (uid: string) => { try { localStorage.removeItem(`hh_pending_data_${uid}`); } catch {} };

// ─── Background API (never blocks the UI) ────────────────────────────────────
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
  };
}
const bg = async (url: string, opts?: RequestInit) =>
  fetch(url, { signal: AbortSignal.timeout(6000), ...opts, headers: { ...(await authHeaders()), ...(opts?.headers || {}) } }).catch(() => {});

async function saveProfileCloud(userId: string, p: UserProfile) {
  saveLocalProfile(p);
  lsSet(`hh_pending_profile_${userId}`, p);
  const res = await apiPost("/profile", { userId, ...p });
  if (res?.ok) clearPendingProfile(userId);
  return !!res?.ok;
}
async function saveDataCloud(userId: string, d: AppData) {
  saveLocalData(userId, d);
  lsSet(`hh_pending_data_${userId}`, d);
  const res = await apiPost("/gamedata", { userId, data: d });
  if (res?.ok) clearPendingData(userId);
  return !!res?.ok;
}
async function flushPendingSync(userId: string) {
  const pp = pendingProfile(userId);
  if (pp) await saveProfileCloud(userId, pp);
  const pd = pendingData(userId);
  if (pd) await saveDataCloud(userId, pd);
}

async function apiFetch<T>(path: string, fallback: T): Promise<T> {
  try { const r = await fetch(`${SERVER}${path}`, { signal: AbortSignal.timeout(6000), headers: await authHeaders() }); return await r.json(); }
  catch { return fallback as any; }
}
async function apiPost(path: string, body: any) {
  try { const r = await fetch(`${SERVER}${path}`, { method: "POST", headers: await authHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(6000) }); return await r.json(); }
  catch { return null; }
}

async function uploadCommunityVideo(userId: string, file: File) {
  const path = `${userId}/${uploadPathName(file.name, "mp4")}`;
  const { error } = await supabase.storage.from("community-videos").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "video/mp4",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from("community-videos").getPublicUrl(path).data.publicUrl;
}
async function uploadUserAsset(bucket: string, userId: string, file: File, fallbackExt: string) {
  const path = `${userId}/${uploadPathName(file.name, fallbackExt)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

const fetchTeams    = async (): Promise<Team[]> => { const d = await apiFetch<{teams: Team[]}>("/teams", {teams:[]}); return d.teams ?? []; };
const createTeam    = (body: any) => apiPost("/teams", body);
const joinTeam      = (id: string, userId: string) => apiPost(`/teams/${id}/join`, { userId });
const leaveTeam     = (id: string, userId: string) => apiPost(`/teams/${id}/leave`, { userId });
const searchUsers   = async (q: string) => { const d = await apiFetch<{users: TaggedUser[]}>(`/users/search?q=${encodeURIComponent(q)}`, {users:[]}); return d.users ?? []; };
const followUser    = (followerId: string, followeeId: string, followerName: string) => apiPost("/follow", { followerId, followeeId, followerName });
const unfollowUser  = (followerId: string, followeeId: string) => apiPost("/unfollow", { followerId, followeeId });
const fetchSocial   = async (userId: string) => apiFetch<{following:string[];followers:string[];followingCount:number;followersCount:number}>(`/social/${userId}`, {following:[],followers:[],followingCount:0,followersCount:0});
const fetchNotifs   = async (userId: string) => { const d = await apiFetch<{notifications: any[]}>(`/notifications/${userId}`, {notifications:[]}); return d.notifications ?? []; };
const markNotifsRead = (userId: string) => apiPost(`/notifications/${userId}/read`, {});
const clearNotifs = (userId: string) => bg(`${SERVER}/notifications/${userId}`, { method: "DELETE" });
const deleteTeam = (id: string) => bg(`${SERVER}/teams/${id}`, { method: "DELETE" });

// ─── Chart Tip ────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, unit = "" }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      {payload.map((item: any) => (
        <p key={item.dataKey || item.name} className="text-primary font-semibold">{item.name ? `${item.name}: ` : ""}{item.value}{unit}</p>
      ))}
    </div>
  );
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar = ({ p, size = 9 }: { p?: MiniProfile | null; size?: number }) => (
  <div className={`w-${size} h-${size} rounded-xl bg-primary/20 flex items-center justify-center text-sm font-black text-primary flex-shrink-0`} style={{ fontFamily: "'Roboto Slab',serif" }}>
    {p?.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover rounded-xl" /> : initials(p)}
  </div>
);

// ─── Quoted Post ──────────────────────────────────────────────────────────────
const QuotedPost = ({ post }: { post: PostData }) => (
  <div className="border border-border rounded-xl p-3 mt-2 space-y-1.5">
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-black text-primary">{initials(post.profile)}</div>
      <span className="text-sm font-semibold">{post.profile?.firstName} {post.profile?.lastName}</span>
      {post.profile?.position && <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">{post.profile.position}</span>}
    </div>
    {post.content && <p className="text-sm text-muted-foreground line-clamp-3">{post.content}</p>}
    {post.videoId ? <div className="aspect-video rounded-lg overflow-hidden bg-zinc-900"><iframe src={`https://www.youtube.com/embed/${post.videoId}`} title="v" allowFullScreen className="w-full h-full" /></div>
      : isDirectVideoUrl(post.videoUrl) && <div className="aspect-video rounded-lg overflow-hidden bg-zinc-900"><video src={post.videoUrl} controls className="w-full h-full object-contain" /></div>}
  </div>
);

// ─── Post Card ────────────────────────────────────────────────────────────────
function PostCard({ post, currentUserId, currentUserName, canModerate = false, onReply, onQuote, onUpdate, onDelete, isReply = false }: {
  post: PostData; currentUserId?: string; currentUserName?: string;
  canModerate?: boolean;
  onReply: (p: PostData) => void; onQuote: (p: PostData) => void;
  onUpdate: (p: PostData) => void; onDelete: (id: string) => void; isReply?: boolean;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [replies, setReplies] = useState<PostData[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const liked = !!currentUserId && post.likes.includes(currentUserId);
  const reposted = !!currentUserId && post.reposts.includes(currentUserId);

  async function handleLike() {
    if (!currentUserId) return;
    const res = await apiPost(`/posts/${post.id}/like`, { userId: currentUserId, userName: currentUserName });
    if (typeof res?.liked === "boolean") onUpdate({ ...post, likes: res.liked ? [...post.likes, currentUserId] : post.likes.filter(id => id !== currentUserId), likeCount: res.likeCount });
  }
  async function handleRepost() {
    if (!currentUserId) return;
    const res = await apiPost(`/posts/${post.id}/repost`, { userId: currentUserId, userName: currentUserName });
    if (typeof res?.reposted === "boolean") onUpdate({ ...post, reposts: res.reposted ? [...post.reposts, currentUserId] : post.reposts.filter(id => id !== currentUserId), repostCount: res.repostCount });
  }
  async function handleShowReplies() {
    if (showReplies) { setShowReplies(false); return; }
    setLoadingReplies(true);
    const d = await apiFetch<{ replies: PostData[] }>(`/posts/${post.id}/replies?viewerId=${encodeURIComponent(currentUserId || "")}`, { replies: [] });
    setReplies(d.replies); setShowReplies(true); setLoadingReplies(false);
  }
  async function handleReport() {
    if (!currentUserId) return;
    await apiPost(`/posts/${post.id}/report`, { userId: currentUserId, reason: "Reported in app" });
    onDelete(post.id);
  }
  async function handleBlock() {
    if (!currentUserId || currentUserId === post.userId) return;
    await apiPost("/block", { userId: currentUserId, blockedUserId: post.userId });
    onDelete(post.id);
  }

  return (
    <div className={`bg-card border border-border rounded-2xl p-4 space-y-3 ${isReply ? "ml-4 border-l-2 border-l-primary/30" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar p={post.profile} size={9} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{post.profile?.firstName} {post.profile?.lastName}</span>
              {post.profile?.position && <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded-md">{post.profile.position}</span>}
            </div>
            <span className="text-xs text-muted-foreground">{timeAgo(post.createdAt)}</span>
          </div>
        </div>
        {(currentUserId === post.userId || canModerate) && (
          <button onClick={async () => { await bg(`${SERVER}/posts/${post.id}`, { method: "DELETE" }); onDelete(post.id); }} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={13} /></button>
        )}
      </div>
      {post.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>}
      {post.videoId ? <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900"><iframe src={`https://www.youtube.com/embed/${post.videoId}`} title="clip" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" /></div>
        : isDirectVideoUrl(post.videoUrl) && <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900"><video src={post.videoUrl} controls className="w-full h-full object-contain" /></div>}
      {post.quotedPost && <QuotedPost post={post.quotedPost} />}
      <div className="flex items-center gap-1 pt-1 border-t border-border">
        <button onClick={handleLike} disabled={!currentUserId} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${liked ? "text-red-400 bg-red-400/10" : "text-muted-foreground hover:text-red-400 hover:bg-red-400/10"} disabled:cursor-not-allowed`}>
          <Heart size={13} className={liked ? "fill-current" : ""} />{post.likeCount > 0 && <span>{post.likeCount}</span>}
        </button>
        <button onClick={() => onReply(post)} disabled={!currentUserId} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:cursor-not-allowed">
          <MessageCircle size={13} />{post.replyCount > 0 && <span>{post.replyCount}</span>}
        </button>
        <button onClick={handleRepost} disabled={!currentUserId} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${reposted ? "text-green-400 bg-green-400/10" : "text-muted-foreground hover:text-green-400 hover:bg-green-400/10"} disabled:cursor-not-allowed`}>
          <Repeat2 size={13} />{post.repostCount > 0 && <span>{post.repostCount}</span>}
        </button>
        <button onClick={() => onQuote(post)} disabled={!currentUserId} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:cursor-not-allowed">
          <Quote size={13} />
        </button>
        <button onClick={handleReport} disabled={!currentUserId} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 disabled:cursor-not-allowed">Report</button>
        {currentUserId && currentUserId !== post.userId && <button onClick={handleBlock} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10">Block</button>}
        {post.replyCount > 0 && !isReply && (
          <button onClick={handleShowReplies} className="ml-auto text-xs text-muted-foreground hover:text-primary">
            {loadingReplies ? "Loading…" : showReplies ? "Hide" : `${post.replyCount} repl${post.replyCount === 1 ? "y" : "ies"}`}
          </button>
        )}
      </div>
      {showReplies && replies.length > 0 && (
        <div className="space-y-3 pt-1">
          {replies.map(r => <PostCard key={r.id} post={r} currentUserId={currentUserId} currentUserName={currentUserName} canModerate={canModerate} onReply={onReply} onQuote={onQuote}
            onUpdate={u => setReplies(prev => prev.map(p => p.id === u.id ? u : p))}
            onDelete={id => setReplies(prev => prev.filter(p => p.id !== id))} isReply />)}
        </div>
      )}
    </div>
  );
}

// ─── Compose Box ──────────────────────────────────────────────────────────────
function ComposeBox({ profile, placeholder = "What's on your mind?", replyTo, quotedPost, onPost, onCancel }: {
  profile: UserProfile; placeholder?: string; replyTo?: PostData; quotedPost?: PostData;
  onPost: (p: PostData) => void; onCancel?: () => void;
}) {
  const [content, setContent] = useState(""), [posting, setPosting] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [videoError, setVideoError] = useState("");
  const canPost = content.trim().length > 0 || !!videoFile;

  function chooseVideo(file?: File) {
    setVideoError("");
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    if (!file) { setVideoFile(null); setVideoPreview(""); return; }
    if (!file.type.startsWith("video/")) { setVideoError("Choose a video file."); return; }
    if (file.size > 100 * 1024 * 1024) { setVideoError("Video is too large. Keep it under 100 MB for now."); return; }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  }

  useEffect(() => () => { if (videoPreview) URL.revokeObjectURL(videoPreview); }, [videoPreview]);

  async function submit() {
    if (!canPost || posting) return;
    setPosting(true);
    setVideoError("");
    try {
      const uploadedVideoUrl = videoFile ? await uploadCommunityVideo(profile.userId, videoFile) : null;
      const res = await apiPost("/posts", { userId: profile.userId, content: content.trim(), videoUrl: uploadedVideoUrl, replyTo: replyTo?.id ?? null, quotedPostId: quotedPost?.id ?? null });
      if (res?.post) {
        res.post.profile = { firstName: profile.firstName, lastName: profile.lastName, position: profile.position, avatarUrl: profile.avatarUrl, role: profile.role };
        onPost(res.post);
      }
      setContent("");
      setVideoFile(null);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
      setVideoPreview("");
    } catch {
      setVideoError("Video could not upload. Make sure the community-videos storage bucket is set up.");
    }
    setPosting(false);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      {(replyTo || quotedPost) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {replyTo ? <><MessageCircle size={11} /> Replying to <strong className="text-foreground">{replyTo.profile?.firstName}</strong></> : <><Quote size={11} /> Quoting <strong className="text-foreground">{quotedPost?.profile?.firstName}</strong></>}
        </p>
      )}
      <div className="flex gap-3">
        <Avatar p={{ firstName: profile.firstName, lastName: profile.lastName, position: profile.position, avatarUrl: profile.avatarUrl, role: profile.role }} size={9} />
        <textarea autoFocus value={content} onChange={e => setContent(e.target.value)} placeholder={placeholder} rows={3}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none" />
      </div>
      {videoPreview && (
        <div className="space-y-2">
          <div className="aspect-video rounded-xl overflow-hidden bg-black"><video src={videoPreview} controls className="w-full h-full object-contain" /></div>
          <button onClick={() => chooseVideo()} className="text-xs text-muted-foreground hover:text-destructive">Remove video</button>
        </div>
      )}
      {videoError && <p className="text-xs text-amber-400 bg-amber-400/10 rounded-xl p-3">{videoError}</p>}
      {quotedPost && <QuotedPost post={quotedPost} />}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <label className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer">
          <Video size={13} /> Video
          <input type="file" accept="video/*" className="hidden" onChange={e => chooseVideo(e.target.files?.[0])} />
        </label>
        <div className="flex gap-2">
          {onCancel && <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg">Cancel</button>}
          <button onClick={submit} disabled={!canPost || posting} className="bg-primary text-primary-foreground text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-accent disabled:opacity-30">
            {posting ? "Posting…" : replyTo ? "Reply" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Feed Tab ─────────────────────────────────────────────────────────────────
function FeedTab({ currentUserId, currentProfile }: { currentUserId?: string; currentProfile?: UserProfile | null }) {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<PostData | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<PostData | null>(null);
  const currentUserName = currentProfile ? `${currentProfile.firstName} ${currentProfile.lastName}`.trim() : undefined;
  const canModerate = isAdmin(currentProfile);

  useEffect(() => {
    apiFetch<{ posts: PostData[] }>(`/posts?viewerId=${encodeURIComponent(currentUserId || "")}`, { posts: [] }).then(d => { setPosts(d.posts ?? []); setLoading(false); });
  }, [currentUserId]);

  const addPost = (p: PostData) => setPosts(prev => [p, ...prev]);

  return (
    <div className="space-y-4">
      {currentProfile && !replyTarget && !quoteTarget && <ComposeBox profile={currentProfile} onPost={addPost} />}
      {replyTarget && currentProfile && <ComposeBox profile={currentProfile} placeholder={`Reply to ${replyTarget.profile?.firstName}…`} replyTo={replyTarget} onPost={p => { addPost(p); setReplyTarget(null); }} onCancel={() => setReplyTarget(null)} />}
      {quoteTarget && currentProfile && <ComposeBox profile={currentProfile} placeholder="Add your thoughts…" quotedPost={quoteTarget} onPost={p => { addPost(p); setQuoteTarget(null); }} onCancel={() => setQuoteTarget(null)} />}
      {!currentProfile && <div className="bg-card border border-border rounded-2xl p-4 text-center text-sm text-muted-foreground">Sign in to post, like, and reply.</div>}
      {loading ? <div className="text-center py-12 text-muted-foreground text-sm">Loading feed…</div>
        : posts.length === 0 ? <div className="text-center py-12 text-muted-foreground"><MessageCircle size={40} className="mx-auto mb-3 opacity-20" /><p className="text-sm">No posts yet. Be the first!</p></div>
        : <div className="space-y-3">{posts.map(post => (
          <PostCard key={post.id} post={post} currentUserId={currentUserId} currentUserName={currentUserName} canModerate={canModerate}
            onReply={p => { setQuoteTarget(null); setReplyTarget(p); }}
            onQuote={p => { setReplyTarget(null); setQuoteTarget(p); }}
            onUpdate={u => setPosts(prev => prev.map(p => p.id === u.id ? u : p))}
            onDelete={id => setPosts(prev => prev.filter(p => p.id !== id))} />
        ))}</div>}
    </div>
  );
}

// ─── Players Tab ──────────────────────────────────────────────────────────────
function PlayersTab({ onSelect }: { onSelect: (p: CommunityPlayer) => void }) {
  const [players, setPlayers] = useState<CommunityPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""), [pos, setPos] = useState("All");

  useEffect(() => { apiFetch<{ players: CommunityPlayer[] }>("/community", { players: [] }).then(d => { setPlayers(d.players ?? []); setLoading(false); }); }, []);

  const filtered = players.filter(p => p.profile?.isPublic !== false)
    .filter(p => `${p.profile?.firstName} ${p.profile?.lastName}`.toLowerCase().includes(search.toLowerCase()))
    .filter(p => pos === "All" || p.profile?.position === pos)
    .sort((a, b) => b.summary.totalMinutes - a.summary.totalMinutes);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search players…" className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary" /></div>
        <div className="flex gap-2 flex-wrap">{["All", ...POSITIONS].map(p => <button key={p} onClick={() => setPos(p)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${pos === p ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>{p}</button>)}</div>
      </div>
      {loading ? <div className="text-center py-12 text-muted-foreground text-sm">Loading players…</div>
        : filtered.length === 0 ? <div className="text-center py-12 text-muted-foreground"><Users size={40} className="mx-auto mb-3 opacity-20" /><p className="text-sm">No players found.</p></div>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{filtered.map(player => (
          <div key={player.userId} onClick={() => onSelect(player)} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/50 transition-all group cursor-pointer">
            <div className="bg-gradient-to-br from-primary/20 to-primary/5 px-5 pt-5 pb-4">
              <div className="flex items-start justify-between">
                <Avatar p={player.profile} size={12} />
                <div className="flex gap-1.5"><span className="bg-primary/20 text-primary text-xs font-semibold px-2 py-1 rounded-lg">{player.profile.position}</span><span className="bg-card text-muted-foreground text-xs px-2 py-1 rounded-lg">{player.profile.gradYear}</span></div>
              </div>
              <div className="mt-3"><h3 className="font-black text-base" style={{ fontFamily: "'Roboto Slab',serif" }}>{player.profile.firstName} {player.profile.lastName}</h3>{player.profile.height && <p className="text-xs text-muted-foreground mt-0.5">{player.profile.height}{player.profile.weight ? ` · ${player.profile.weight} lbs` : ""}</p>}</div>
            </div>
            <div className="px-5 py-4 grid grid-cols-3 gap-2 text-center">
              {[{ l: "Streak", v: `${player.summary.streak}d` }, { l: "Shooting", v: `${player.summary.shootingPct}%` }, { l: "Hours", v: `${Math.round(player.summary.totalMinutes / 60)}h` }].map(s => (
                <div key={s.l}><p className="text-lg font-black text-primary leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{s.v}</p><p className="text-xs text-muted-foreground mt-0.5">{s.l}</p></div>
              ))}
            </div>
            <div className="px-5 pb-4 flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: getRank(player.summary.totalMinutes).color }}>{getRank(player.summary.totalMinutes).emoji} {getRank(player.summary.totalMinutes).label}</span>
              <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary" />
            </div>
          </div>
        ))}</div>}
    </div>
  );
}

// ─── Community Page ───────────────────────────────────────────────────────────
// ─── Teams Tab ────────────────────────────────────────────────────────────────
function TeamsTab({ currentUserId, currentProfile }: { currentUserId?: string; currentProfile?: UserProfile | null }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [levelFilter, setLevelFilter] = useState("All");
  const [form, setForm] = useState({ name: "", level: TEAM_LEVELS[0], description: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { fetchTeams().then(t => { setTeams(t); setLoading(false); }); }, []);

  const filtered = teams.filter(t => levelFilter === "All" || t.level === levelFilter);
  const canModerate = isAdmin(currentProfile);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !form.name.trim()) return;
    setSaving(true);
    const res = await createTeam({ userId: currentUserId, ...form });
    if (res?.team) setTeams(prev => [{ ...res.team, memberProfiles: [], creatorName: "You" }, ...prev]);
    setCreating(false); setForm({ name: "", level: TEAM_LEVELS[0], description: "", location: "" }); setSaving(false);
  }

  async function handleJoin(teamId: string) {
    if (!currentUserId) return;
    await joinTeam(teamId, currentUserId);
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, members: [...t.members, currentUserId] } : t));
  }

  async function handleLeave(teamId: string) {
    if (!currentUserId) return;
    await leaveTeam(teamId, currentUserId);
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, members: t.members.filter(id => id !== currentUserId) } : t));
  }

  async function handleDelete(teamId: string) {
    await deleteTeam(teamId);
    setTeams(prev => prev.filter(t => t.id !== teamId));
  }

  const inputCls = "w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Browse teams or create your own. Any level welcome.</p>
        {currentUserId && !creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl hover:bg-accent transition-colors">
            <Plus size={14} /> Create Team
          </button>
        )}
      </div>

      {creating && currentUserId && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h3 className="font-bold">Create a Team</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Team Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Westside Ballers" required className={inputCls} /></div>
            <div><label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Level</label>
              <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} className={inputCls}>
                {TEAM_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Location (optional)</label><input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Chicago, IL" className={inputCls} /></div>
            <div><label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Description (optional)</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What's your team about?" className={inputCls} /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !form.name.trim()} className="bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl hover:bg-accent disabled:opacity-40 text-sm">{saving ? "Creating…" : "Create Team"}</button>
            <button type="button" onClick={() => setCreating(false)} className="bg-secondary text-secondary-foreground font-semibold px-4 py-2.5 rounded-xl hover:bg-muted text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Level filter */}
      <div className="flex gap-2 flex-wrap">
        {["All", ...TEAM_LEVELS].map(l => (
          <button key={l} onClick={() => setLevelFilter(l)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${levelFilter === l ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>

      {loading ? <div className="text-center py-12 text-muted-foreground text-sm">Loading teams…</div>
        : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">No teams yet. Be the first to create one!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(team => {
              const isMember = currentUserId ? team.members.includes(currentUserId) : false;
              const isCreator = team.createdBy === currentUserId;
              const isExpanded = expanded === team.id;
              return (
                <div key={team.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-black text-base" style={{ fontFamily: "'Roboto Slab',serif" }}>{team.name}</h3>
                          <span className="bg-primary/20 text-primary text-xs font-semibold px-2 py-0.5 rounded-lg">{team.level}</span>
                          {isMember && <span className="bg-green-400/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-lg">✓ Member</span>}
                        </div>
                        {team.location && <p className="text-xs text-muted-foreground mt-0.5">📍 {team.location}</p>}
                        {team.description && <p className="text-sm text-muted-foreground mt-1">{team.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{team.members.length} member{team.members.length !== 1 ? "s" : ""} · Created by {isCreator ? "you" : team.creatorName}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {currentUserId && !isMember && <button onClick={() => handleJoin(team.id)} className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent">Join</button>}
                        {currentUserId && isMember && !isCreator && <button onClick={() => handleLeave(team.id)} className="bg-secondary text-muted-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:text-foreground">Leave</button>}
                        {(isCreator || canModerate) && <button onClick={() => handleDelete(team.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={14} /></button>}
                        <button onClick={() => setExpanded(isExpanded ? null : team.id)} className="text-xs text-muted-foreground hover:text-primary">{isExpanded ? "Hide" : "Roster"}</button>
                      </div>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-5 pb-4 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Roster</p>
                      {team.memberProfiles.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No profiles loaded yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {team.memberProfiles.map(m => (
                            <div key={m.userId} className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-1.5">
                              <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center text-xs font-black text-primary">{m.firstName[0]}{m.lastName[0]}</div>
                              <span className="text-sm">{m.firstName} {m.lastName}</span>
                              <span className="text-xs text-muted-foreground">{m.position}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

// ─── Notifications Panel ──────────────────────────────────────────────────────
function NotifPanel({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifs(userId).then(n => { setNotifs(n); setLoading(false); });
    markNotifsRead(userId).catch(() => {});
  }, [userId]);

  const icons: Record<string, string> = { like: "❤️", repost: "🔄", reply: "💬", follow: "👤", tag: "🏷️" };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm bg-card border-l border-border h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-black text-lg" style={{ fontFamily: "'Roboto Slab',serif" }}>Notifications</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
        </div>
        {loading ? <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
          : notifs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-3xl mb-3">🔔</p>
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifs.map(n => (
                <div key={n.id} className={`px-5 py-4 flex items-start gap-3 ${!n.read ? "bg-primary/5" : ""}`}>
                  <span className="text-xl flex-shrink-0">{icons[n.type] || "🔔"}</span>
                  <div>
                    <p className="text-sm">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── Follow Button ────────────────────────────────────────────────────────────
function FollowButton({ currentUserId, currentUserName, targetUserId }: { currentUserId?: string; currentUserName?: string; targetUserId: string }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    fetchSocial(currentUserId).then(s => setFollowing(s.following.includes(targetUserId)));
  }, [currentUserId, targetUserId]);

  if (!currentUserId || currentUserId === targetUserId || following === null) return null;

  async function toggle() {
    if (!currentUserId || loading) return;
    setLoading(true);
    if (following) {
      await unfollowUser(currentUserId, targetUserId);
      setFollowing(false);
    } else {
      await followUser(currentUserId, targetUserId, currentUserName || "Someone");
      setFollowing(true);
    }
    setLoading(false);
  }

  return (
    <button onClick={toggle} disabled={loading}
      className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-colors ${following ? "bg-secondary text-muted-foreground hover:text-destructive hover:bg-destructive/10" : "bg-primary text-primary-foreground hover:bg-accent"}`}>
      {loading ? "…" : following ? "Following" : "Follow"}
    </button>
  );
}

function CommunityPage({ currentUserId, currentProfile, onBack }: { currentUserId?: string; currentProfile?: UserProfile | null; onBack?: () => void }) {
  const [tab, setTab] = useState<"feed" | "players" | "teams">("feed");
  const [selected, setSelected] = useState<CommunityPlayer | null>(null);

  const currentUserName = currentProfile ? `${currentProfile.firstName} ${currentProfile.lastName}`.trim() : undefined;
  if (selected) return <PlayerProfileView player={selected} onBack={() => setSelected(null)} currentUserId={currentUserId} currentUserName={currentUserName} />;

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <header className="border-b border-border px-6 py-5 max-w-5xl mx-auto flex items-center gap-3">
        {onBack && <button onClick={onBack} className="text-muted-foreground hover:text-foreground"><ChevronLeft size={20} /></button>}
        <span className="text-2xl">🏀</span>
        <div><h1 className="text-xl font-black tracking-tight leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>COMMUNITY</h1><p className="text-xs text-muted-foreground uppercase tracking-widest">Players · Teams · Coaches · Scouts</p></div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
          {(["feed", "players", "teams"] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
        </div>
        {tab === "feed"    && <FeedTab currentUserId={currentUserId} currentProfile={currentProfile} />}
        {tab === "players" && <PlayersTab onSelect={setSelected} />}
        {tab === "teams"   && <TeamsTab currentUserId={currentUserId} currentProfile={currentProfile} />}
      </main>
    </div>
  );
}

// ─── Player Profile View ──────────────────────────────────────────────────────
function PlayerProfileView({ player, onBack, currentUserId, currentUserName }: { player: CommunityPlayer; onBack?: () => void; currentUserId?: string; currentUserName?: string; }) {
  const [gameData, setGameData] = useState<AppData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<{ data: AppData | null }>(`/gamedata/${player.userId}`, { data: null }).then(d => { if (d.data) setGameData(d.data); });
  }, [player.userId]);

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("player", player.userId); url.searchParams.delete("view");
    navigator.clipboard.writeText(url.toString()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => window.prompt("Copy this profile link:", url.toString()));
  }

  const shots = gameData?.shots || [], sessions = gameData?.sessions || [];
  const pct = shootingPct(shots);
  const graphData = sessions.slice(-7).map(s => ({ date: shortDate(s.date), minutes: s.minutes }));
  const shotGraph = shots.map((s, i) => ({ session: `S${i + 1}`, pct: s.attempted > 0 ? Math.round((s.made / s.attempted) * 100) : 0 }));
  const p = player.profile, sum = player.summary;

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <header className="border-b border-border px-6 py-5 max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && <button onClick={onBack} className="text-muted-foreground hover:text-foreground"><ChevronLeft size={20} /></button>}
          <span className="text-2xl">🏀</span>
          <div><h1 className="text-xl font-black leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{p.firstName.toUpperCase()} {p.lastName.toUpperCase()}</h1><p className="text-xs text-muted-foreground uppercase tracking-widest">Player Profile</p></div>
        </div>
        <div className="flex items-center gap-2">
          <FollowButton currentUserId={currentUserId} currentUserName={currentUserName} targetUserId={player.userId} />
          <button onClick={copyLink} className="flex items-center gap-2 text-xs bg-card border border-border rounded-xl px-3 py-2 hover:border-primary hover:text-primary transition-all">
            {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied!" : "Share"}
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent px-6 py-6 flex items-center gap-5">
            <Avatar p={p} size={16} />
            <div className="flex-1">
              <h2 className="text-2xl font-black leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{p.firstName} {p.lastName}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                {p.position && <span className="bg-primary/20 text-primary text-xs font-semibold px-2.5 py-1 rounded-lg">{p.position}</span>}
                {p.gradYear && <span className="bg-secondary text-muted-foreground text-xs px-2.5 py-1 rounded-lg">Class of {p.gradYear}</span>}
              </div>
              {p.bio && <p className="text-sm text-muted-foreground mt-2">{p.bio}</p>}
            </div>
          </div>
          {(p.strengths || p.weaknesses) && (
            <div className="px-6 py-4 border-t border-border grid grid-cols-2 gap-4">
              {p.strengths && <div><p className="text-xs text-primary uppercase tracking-wider font-semibold mb-1">💪 Strengths</p><p className="text-sm text-muted-foreground">{p.strengths}</p></div>}
              {p.weaknesses && <div><p className="text-xs text-amber-400 uppercase tracking-wider font-semibold mb-1">🎯 Areas to Improve</p><p className="text-sm text-muted-foreground">{p.weaknesses}</p></div>}
            </div>
          )}
          {(p.height || p.weight || p.wingspan || p.vertical) && (
            <div className="px-6 py-4 border-t border-border grid grid-cols-4 gap-4 text-center">
              {[{ l: "Height", v: p.height }, { l: "Weight", v: p.weight ? `${p.weight} lbs` : "" }, { l: "Wingspan", v: p.wingspan }, { l: "Vertical", v: p.vertical ? `${p.vertical}"` : "" }].filter(m => m.v).map(m => (
                <div key={m.l}><p className="text-lg font-black leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{m.v}</p><p className="text-xs text-muted-foreground mt-1">{m.l}</p></div>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[{ Icon: Flame, l: "Streak", v: String(sum.streak), u: "days" }, { Icon: Target, l: "Shooting %", v: String(pct), u: "%" }, { Icon: Clock, l: "Hours", v: String(Math.round(sum.totalMinutes / 60)), u: "hrs" }].map(({ Icon, l, v, u }) => (
            <div key={l} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2"><Icon size={13} className="text-primary" />{l}</div>
              <div className="flex items-end gap-1"><span className="text-4xl font-black text-primary leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{v}</span><span className="text-muted-foreground text-sm mb-0.5">{u}</span></div>
            </div>
          ))}
        </div>
        {graphData.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5"><TrendingUp size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Recent Practice</span></div>
            <div className="h-44"><ResponsiveContainer width="100%" height="100%"><BarChart id="pub-dur" data={graphData} barSize={28} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#8a8680", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8a8680", fontSize: 11 }} axisLine={false} tickLine={false} unit=" m" />
              <Tooltip content={<ChartTip unit=" min" />} cursor={{ fill: "rgba(21,148,71,0.07)" }} />
              <Bar name="pub-min" dataKey="minutes" fill="#159447" radius={[6, 6, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
          </div>
        )}
        {shotGraph.length > 1 && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5"><Target size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Shooting % Per Session</span></div>
            <div className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart id="pub-shot" data={shotGraph} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="session" tick={{ fill: "#8a8680", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: "#8a8680", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <ReferenceLine y={pct} stroke="rgba(21,148,71,0.3)" strokeDasharray="4 4" />
              <Tooltip content={<ChartTip unit="%" />} cursor={{ stroke: "rgba(21,148,71,0.2)", strokeWidth: 1 }} />
              <Line name="pub-pct" type="monotone" dataKey="pct" stroke="#159447" strokeWidth={2.5} dot={{ fill: "#159447", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#159447" }} />
            </LineChart></ResponsiveContainer></div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  function reset() { setMsg(null); setPassword(""); }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (error.message.toLowerCase().includes("invalid") || error.message.toLowerCase().includes("credentials")) {
        setMsg({ text: "Wrong email or password. Double-check and try again, or create a new account." });
      } else if (error.message.toLowerCase().includes("confirm") || error.message.toLowerCase().includes("verified")) {
        setMsg({ text: "Your email isn't confirmed yet. Go to supabase.com/dashboard → Authentication → Settings and turn OFF \"Enable email confirmations\", then try again." });
      } else {
        setMsg({ text: error.message });
      }
      setLoading(false);
    }
    // success: onAuthStateChange handles the rest automatically
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setMsg({ text: error.message });
      setLoading(false);
    } else if (data.user && !data.session) {
      // Email confirmation required
      setMsg({ text: "⚠️ Account created but email confirmation is ON. Go to Supabase → Authentication → Settings → turn off \"Enable email confirmations\", then sign in." });
      setLoading(false);
    }
    // If session exists, onAuthStateChange fires automatically → user is logged in
  }

  const inputCls = "w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary transition-all";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1400&h=900&fit=crop&auto=format" alt="" className="w-full h-full object-cover opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      </div>
      <div className="relative w-full max-w-sm flex flex-col gap-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-6xl">🏀</span>
          <div>
            <h1 className="text-4xl font-black tracking-tight" style={{ fontFamily: "'Roboto Slab',serif" }}>{APP_NAME}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{APP_TAGLINE}</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {(["signin", "signup"] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); reset(); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="flex flex-col gap-3">
            <input
              autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email address" required className={inputCls}
            />
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Create a password (min 6 chars)" : "Password"}
              required minLength={6} className={inputCls}
            />
            {msg && (
              <p className={`text-xs rounded-xl p-3 leading-relaxed ${msg.ok ? "text-green-400 bg-green-400/10" : "text-amber-400 bg-amber-400/10"}`}>
                {msg.text}
              </p>
            )}
            <button type="submit" disabled={loading}
              className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-xl hover:bg-accent transition-colors disabled:opacity-40 text-sm mt-1">
              {loading ? "Please wait…" : mode === "signin" ? "Sign In →" : "Create Account 🏀"}
            </button>
          </form>
          <p className="text-xs text-center text-muted-foreground mt-4">
            {mode === "signin" ? "New here? " : "Already have an account? "}
            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); reset(); }} className="text-primary hover:underline font-medium">
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>

        {/* Community access */}
        <button onClick={() => { const u = new URL(window.location.href); u.searchParams.set("view", "community"); window.location.href = u.toString(); }}
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
          <Globe size={14} /> View Community Board (coaches &amp; scouts)
        </button>
      </div>
    </div>
  );
}

// ─── Profile Setup ────────────────────────────────────────────────────────────
function ProfileSetup({ userId, email, onComplete }: { userId: string; email: string; onComplete: (p: UserProfile) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", avatarUrl: "", position: "PG", gradYear: String(new Date().getFullYear() + 1), height: "", weight: "", wingspan: "", vertical: "", bio: "", strengths: "", weaknesses: "", isPublic: true });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const cls = "bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary w-full";
  const lbl = "text-xs text-muted-foreground uppercase tracking-wider mb-1 block";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    const profile: UserProfile = withRole({ userId, email, ...form, firstName: sanitizeText(form.firstName), lastName: sanitizeText(form.lastName), avatarUrl: sanitizeImageUrl(form.avatarUrl) });
    void saveProfileCloud(userId, profile);
    onComplete(profile);
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-8"><span className="text-4xl">🏀</span><h1 className="text-2xl font-black mt-3" style={{ fontFamily: "'Roboto Slab',serif" }}>Set Up Your Profile</h1><p className="text-muted-foreground text-sm mt-1">Coaches and scouts can discover you on the community board.</p></div>
        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>First Name *</label><input autoFocus value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="First name" className={cls} required /></div>
            <div><label className={lbl}>Last Name *</label><input value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Last name" className={cls} required /></div>
          </div>
          <div><label className={lbl}>Profile Image</label><input type="file" accept="image/*" onChange={async e => { const f=e.target.files?.[0]; if(f) set("avatarUrl", await uploadUserAsset("profile-images", userId, f, "jpg").catch(()=>"")); }} className={cls} />{form.avatarUrl && <p className="text-xs text-primary mt-1">Image selected</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Position</label><select value={form.position} onChange={e => set("position", e.target.value)} className={cls}>{POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
            <div><label className={lbl}>Grad Year</label><input value={form.gradYear} onChange={e => set("gradYear", e.target.value)} placeholder="2026" className={cls} /></div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Measurables</p>
            <div className="grid grid-cols-2 gap-3">
              {[{ k: "height", l: "Height", p: '6\'2"' }, { k: "weight", l: "Weight (lbs)", p: "185" }, { k: "wingspan", l: "Wingspan", p: '6\'5"' }, { k: "vertical", l: "Vertical (in)", p: "34" }].map(({ k, l, p }) => (
                <div key={k}><label className={lbl}>{l}</label><input value={(form as any)[k]} onChange={e => set(k, e.target.value)} placeholder={p} className={cls} /></div>
              ))}
            </div>
          </div>
          <div><label className={lbl}>Bio (optional)</label><textarea value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="Tell coaches and scouts about yourself…" rows={2} className={`${cls} resize-none`} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Strengths (optional)</label><textarea value={form.strengths} onChange={e => set("strengths", e.target.value)} placeholder="e.g. Athleticism, handles, court vision…" rows={2} className={`${cls} resize-none`} /></div>
            <div><label className={lbl}>Areas to Improve (optional)</label><textarea value={form.weaknesses} onChange={e => set("weaknesses", e.target.value)} placeholder="e.g. 3-point shooting, defense…" rows={2} className={`${cls} resize-none`} /></div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => set("isPublic", !form.isPublic)} className={`w-10 h-6 rounded-full transition-colors relative ${form.isPublic ? "bg-primary" : "bg-muted"}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.isPublic ? "left-5" : "left-1"}`} />
            </div>
            <div><p className="text-sm font-medium">Visible on Community Board</p><p className="text-xs text-muted-foreground">Coaches and scouts can see your profile</p></div>
          </label>
          <button type="submit" disabled={!form.firstName.trim() || !form.lastName.trim()} className="bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-accent disabled:opacity-40">
            Let&apos;s Go 🏀
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Training View ────────────────────────────────────────────────────────────
function ViewHero({ img, title, sub }: { img: string; title: string; sub: string }) {
  return (
    <div className="relative rounded-2xl overflow-hidden h-36 bg-zinc-900">
      <img src={`https://images.unsplash.com/photo-${img}?w=1200&h=300&fit=crop&auto=format`} alt={title} className="w-full h-full object-cover opacity-50" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-transparent flex items-end p-5">
        <div><p className="text-xs uppercase tracking-widest text-primary font-medium mb-0.5">{sub}</p><h2 className="text-2xl font-black text-white leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{title}</h2></div>
      </div>
    </div>
  );
}

function FlightTimeTool() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef(0.25);
  const [videoUrl, setVideoUrl] = useState("");
  const [takeoff, setTakeoff] = useState<number | null>(null);
  const [landing, setLanding] = useState<number | null>(null);
  const [fps, setFps] = useState(240);
  const [speed, setSpeed] = useState(0.25);
  const [videoTime, setVideoTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [slowPlaying, setSlowPlaying] = useState(false);
  const flight = takeoff !== null && landing !== null && landing > takeoff ? landing - takeoff : 0;
  const vertical = flight ? verticalFromFlightTime(flight) : 0;

  const applySpeed = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
  }, [speed]);

  useEffect(() => { speedRef.current = speed; applySpeed(); }, [applySpeed, speed, videoUrl]);
  useEffect(() => () => {
    if (slowTimerRef.current) clearInterval(slowTimerRef.current);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  function stopSlowPlay() {
    if (slowTimerRef.current) clearInterval(slowTimerRef.current);
    slowTimerRef.current = null;
    setSlowPlaying(false);
  }
  function seekTo(time: number) {
    const video = videoRef.current;
    if (!video) return;
    const max = Number.isFinite(video.duration) ? video.duration : duration || Number.MAX_SAFE_INTEGER;
    const next = Math.max(0, Math.min(max, time));
    video.currentTime = next;
    setVideoTime(next);
  }
  function toggleSlowPlay() {
    const video = videoRef.current;
    if (!video) return;
    if (slowTimerRef.current) { stopSlowPlay(); return; }
    video.pause();
    applySpeed();
    setSlowPlaying(true);
    slowTimerRef.current = setInterval(() => {
      const current = videoRef.current;
      if (!current) { stopSlowPlay(); return; }
      const next = current.currentTime + (1 / 30) * speedRef.current;
      const max = Number.isFinite(current.duration) ? current.duration : duration;
      if (max && next >= max) { seekTo(max); stopSlowPlay(); return; }
      seekTo(next);
    }, 33);
  }

  function loadVideo(file?: File) {
    if (!file) return;
    stopSlowPlay();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setTakeoff(null);
    setLanding(null);
    setVideoTime(0);
    setDuration(0);
  }
  function markTakeoff() { if (videoRef.current) setTakeoff(videoRef.current.currentTime); }
  function markLanding() { if (videoRef.current) setLanding(videoRef.current.currentTime); }
  function stepFrame(direction: -1 | 1) {
    const video = videoRef.current;
    if (!video) return;
    stopSlowPlay();
    video.pause();
    applySpeed();
    seekTo(video.currentTime + direction / fps);
    window.setTimeout(() => setVideoTime(videoRef.current?.currentTime || 0), 80);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1"><Activity size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Vertical Jump Flight Time</span></div>
          <p className="text-xs text-muted-foreground">Record or choose a jump video, pause on takeoff and landing, and the app converts flight time to vertical.</p>
        </div>
        <label className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap">
          Choose Video
          <input type="file" accept="video/*" className="hidden" onChange={e => loadVideo(e.target.files?.[0])} />
        </label>
      </div>

      {videoUrl ? (
        <div className="space-y-3">
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            preload="metadata"
            onLoadedMetadata={e => { applySpeed(); setDuration(e.currentTarget.duration || 0); setVideoTime(e.currentTarget.currentTime || 0); }}
            onPlay={() => { stopSlowPlay(); if (videoRef.current) videoRef.current.playbackRate = 1; }}
            onPause={() => setSlowPlaying(false)}
            onTimeUpdate={e => setVideoTime(e.currentTarget.currentTime)}
            onSeeked={e => setVideoTime(e.currentTarget.currentTime)}
            className="w-full max-h-80 rounded-xl bg-black object-contain"
          />
          <div className="bg-background border border-border rounded-xl p-3 space-y-3">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={1 / fps}
              value={Math.min(videoTime, duration || videoTime)}
              onChange={e => { stopSlowPlay(); seekTo(Number(e.target.value)); }}
              className="w-full accent-primary"
            />
            <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
              <button type="button" onClick={toggleSlowPlay} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:bg-accent flex items-center gap-2">
                {slowPlaying ? <Pause size={14} /> : <Play size={14} />} {slowPlaying ? "Pause" : "Slow Play"}
              </button>
              <p className="text-xs text-muted-foreground text-center">Current: {videoTime.toFixed(3)}s / {(duration || 0).toFixed(3)}s</p>
              <button type="button" onClick={() => { stopSlowPlay(); videoRef.current?.paused ? videoRef.current.play().catch(() => {}) : videoRef.current?.pause(); }} className="bg-secondary text-secondary-foreground rounded-xl px-4 py-2 text-sm font-semibold hover:bg-muted">
                Normal
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <div className="flex flex-wrap items-center gap-2 bg-background border border-border rounded-xl p-2">
              <span className="text-xs text-muted-foreground px-1">Slow-mo</span>
              {[0.25, 0.5, 1].map(rate => (
                <button type="button" key={rate} onClick={() => setSpeed(rate)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${speed === rate ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
                  {rate}x
                </button>
              ))}
              <select value={fps} onChange={e => setFps(Number(e.target.value))} className="ml-auto bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none">
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
                <option value={120}>120 fps</option>
                <option value={240}>240 fps</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => stepFrame(-1)} className="bg-secondary text-secondary-foreground rounded-xl px-4 py-2 text-sm font-black hover:bg-muted" aria-label="Previous frame">-1 frame</button>
              <button type="button" onClick={() => stepFrame(1)} className="bg-secondary text-secondary-foreground rounded-xl px-4 py-2 text-sm font-black hover:bg-muted" aria-label="Next frame">+1 frame</button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">Current: {videoTime.toFixed(3)}s • Arrow step: {(1 / fps).toFixed(4)}s</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { stopSlowPlay(); seekTo(videoTime - 5 / fps); }} className="bg-secondary text-secondary-foreground rounded-xl py-2 text-sm font-semibold hover:bg-muted">-5 frames</button>
            <button type="button" onClick={() => { stopSlowPlay(); seekTo(videoTime + 5 / fps); }} className="bg-secondary text-secondary-foreground rounded-xl py-2 text-sm font-semibold hover:bg-muted">+5 frames</button>
          </div>
          <p className="text-xs text-muted-foreground text-center">If 240 fps barely moves, try 60 fps. Some phones export slow-mo as a 30 fps playback file.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={markTakeoff} className="bg-secondary text-secondary-foreground rounded-xl py-2 text-sm font-semibold hover:bg-muted">Mark Takeoff</button>
            <button onClick={markLanding} className="bg-secondary text-secondary-foreground rounded-xl py-2 text-sm font-semibold hover:bg-muted">Mark Landing</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground">Takeoff</p><p className="text-lg font-black text-primary">{takeoff === null ? "--" : `${takeoff.toFixed(2)}s`}</p></div>
            <div className="bg-background border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground">Flight</p><p className="text-lg font-black text-primary">{flight ? `${flight.toFixed(2)}s` : "--"}</p></div>
            <div className="bg-background border border-border rounded-xl p-3"><p className="text-xs text-muted-foreground">Vertical</p><p className="text-lg font-black text-primary">{vertical ? `${vertical}"` : "--"}</p></div>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          On phone, record in slow-mo first, then tap Choose Video to pick from camera roll. Use 240 fps if your phone recorded 240 fps slow-mo.
        </div>
      )}
    </div>
  );
}

function buildTrainingPlan(plan: TrainingPlanSettings) {
  const age = Number(plan.age) || 15;
  const practices = Math.max(0, Number(plan.practicesPerWeek) || 0);
  const games = Math.max(0, Number(plan.gamesPerWeek) || 0);
  const beginner = plan.experience === "Beginner";
  const advanced = plan.experience === "Advanced";
  const heavyWeek = practices + games >= 6;
  const lowImpact = plan.kneePain || heavyWeek || age < 14;
  const sessions = plan.inSeason ? Math.max(2, Math.min(4, 5 - games)) : advanced ? 5 : beginner ? 3 : 4;
  const minutes = lowImpact ? 35 : plan.inSeason ? 45 : advanced ? 70 : 55;
  const goal = plan.goal.toLowerCase();
  const skillFocus = goal.includes("shoot") ? ["Form shooting close to rim", "Spot-up makes", "Game-speed threes", "Free throws under fatigue"]
    : goal.includes("handle") ? ["Pound dribbles", "Change of pace", "Combo moves", "Pressure retreat dribbles"]
    : goal.includes("vert") || goal.includes("athletic") ? ["Landing mechanics", "Pogo jumps", "Approach jumps", "Core stiffness"]
    : goal.includes("def") ? ["Stance holds", "Closeout footwork", "Slide sprints", "Contain angles"]
    : ["Ball handling", "Finishing", "Shooting", "Conditioning"];
  const strength = lowImpact ? "2 low-impact strength days: hips, hamstrings, calves, core, and controlled squats. Avoid painful jumping."
    : "2 strength days: squat/hinge pattern, single-leg work, calves, core, and mobility.";
  return {
    sessions,
    minutes,
    weekly: [
      `Do ${sessions} training sessions per week at about ${minutes} minutes each.`,
      plan.inSeason ? "Keep extra work lighter because games/practices already add load." : "Use one harder skill day, one strength day, and one conditioning day each week.",
      strength,
      lowImpact ? "Knee pain rule: no drill should make pain worse. Swap jumps for form shooting, biking, mobility, and controlled strength." : "Add 10-15 minutes of athletic work after warmup on non-game days.",
    ],
    session: [
      "Warmup: 5-8 min movement, mobility, and easy ball handling.",
      `Main skill: ${skillFocus.slice(0, 3).join(", ")}.`,
      `Goal block: ${skillFocus[3] || "free throws"} for 10-15 focused minutes.`,
      "Finish: track makes, attempts, or time so your dashboard updates.",
    ],
  };
}

function TrainingPlanBuilder({ data, onUpdate }: { data: AppData; onUpdate: (d: AppData) => void }) {
  const plan = data.trainingPlan || emptyTrainingPlan();
  const generated = buildTrainingPlan(plan);
  const set = (k: keyof TrainingPlanSettings, v: string | boolean) => onUpdate({ ...data, trainingPlan: { ...plan, [k]: v } });
  const input = "bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary w-full";
  const label = "text-xs text-muted-foreground uppercase tracking-wider mb-1 block";

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2"><Edit3 size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Strength Training Plan</span></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div><label className={label}>Age</label><input value={plan.age} onChange={e => set("age", e.target.value)} type="number" className={input} /></div>
        <div><label className={label}>Experience</label><select value={plan.experience} onChange={e => set("experience", e.target.value)} className={input}>{["Beginner","Intermediate","Advanced"].map(x => <option key={x}>{x}</option>)}</select></div>
        <div><label className={label}>Practices/week</label><input value={plan.practicesPerWeek} onChange={e => set("practicesPerWeek", e.target.value)} type="number" className={input} /></div>
        <div><label className={label}>Games/week</label><input value={plan.gamesPerWeek} onChange={e => set("gamesPerWeek", e.target.value)} type="number" className={input} /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><label className={label}>Equipment</label><input value={plan.equipment} onChange={e => set("equipment", e.target.value)} placeholder="Ball, hoop, weights..." className={input} /></div>
        <div><label className={label}>Goal</label><select value={plan.goal} onChange={e => set("goal", e.target.value)} className={input}>{["Shooting","Handles","Vertical / athleticism","Defense","All-around"].map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => set("inSeason", !plan.inSeason)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${plan.inSeason ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>In season: {plan.inSeason ? "Yes" : "No"}</button>
          <button onClick={() => set("kneePain", !plan.kneePain)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${plan.kneePain ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>Knee pain: {plan.kneePain ? "Yes" : "No"}</button>
        </div>
      </div>
      <div><label className={label}>Your notes</label><textarea value={plan.notes} onChange={e => set("notes", e.target.value)} placeholder="Write drills, schedule limits, coach notes, or things you want in the plan..." rows={3} className={`${input} resize-none`} /></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-background border border-border rounded-xl p-4">
          <p className="text-sm font-black text-primary mb-2">{generated.sessions} days/week • {generated.minutes} min/session</p>
          {generated.weekly.map(x => <p key={x} className="text-sm text-muted-foreground mb-2">{x}</p>)}
        </div>
        <div className="bg-background border border-border rounded-xl p-4">
          <p className="text-sm font-black text-primary mb-2">Session template</p>
          {generated.session.map(x => <p key={x} className="text-sm text-muted-foreground mb-2">{x}</p>)}
        </div>
      </div>
    </div>
  );
}

function JumpTestingSection({ data, onUpdate }: { data: AppData; onUpdate: (d: AppData) => void }) {
  const [type, setType] = useState<JumpTestEntry["type"]>("Countermovement Jump");
  const [height, setHeight] = useState("");
  const [contact, setContact] = useState("");
  const [notes, setNotes] = useState("");
  const tests = data.jumpTests || [];
  const rsiHistory = tests.filter(t => t.rsi).map(t => ({ date: shortDate(t.date), rsi: t.rsi }));
  function save() {
    const h = parseFloat(height), c = parseFloat(contact);
    if (!h) return;
    const entry: JumpTestEntry = { id: crypto.randomUUID(), date: new Date().toISOString().slice(0,10), type, height: h, contactTime: c || undefined, rsi: c ? Math.round((h / 39.37 / c) * 100) / 100 : undefined, notes: notes.trim() };
    onUpdate({ ...data, jumpTests: [...tests, entry] });
    setHeight(""); setContact(""); setNotes("");
  }
  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2"><Activity size={14} className="text-primary"/><span className="text-xs uppercase tracking-wider text-muted-foreground">Jump Testing</span></div>
      <div className="grid md:grid-cols-4 gap-3">
        <select value={type} onChange={e => setType(e.target.value as JumpTestEntry["type"])} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none">
          <option>Squat Jump</option><option>Countermovement Jump</option><option>Drop Jump</option>
        </select>
        <input value={height} onChange={e => setHeight(e.target.value)} type="number" placeholder="Jump height (in)" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none" />
        <input value={contact} onChange={e => setContact(e.target.value)} type="number" step="0.01" placeholder="Contact time (sec)" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none" />
        <button onClick={save} className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-sm font-semibold">Save Test</button>
      </div>
      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes" className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none" />
      {rsiHistory.length >= 2 && <div className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={rsiHistory}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="date" tick={{fill:"#8a8680",fontSize:11}} /><YAxis tick={{fill:"#8a8680",fontSize:11}} /><Tooltip content={<ChartTip />} /><Line type="monotone" dataKey="rsi" stroke="#159447" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div>}
      <div className="space-y-2">{[...tests].reverse().slice(0, 8).map(t => <div key={t.id} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 text-sm"><span>{shortDate(t.date)} - {t.type}</span><span className="text-primary font-semibold">{t.height}"{t.rsi ? ` | RSI ${t.rsi}` : ""}</span></div>)}</div>
    </div>
  );
}

function AthleticAnalysisSection({ data, onUpdate }: { data: AppData; onUpdate: (d: AppData) => void }) {
  const lifts = data.athleticLifts || { powerClean: "", deepBackSquat: "" };
  const setLift = (k: keyof AthleticLifts, v: string) => onUpdate({ ...data, athleticLifts: { ...lifts, [k]: v } });
  const tests = data.jumpTests || [];
  const latest = (type: JumpTestEntry["type"]) => [...tests].reverse().find(t => t.type === type)?.height || 0;
  const sj = latest("Squat Jump"), cmj = latest("Countermovement Jump"), dj = latest("Drop Jump");
  const pc = parseFloat(lifts.powerClean), squat = parseFloat(lifts.deepBackSquat);
  const powerRatio = pc && squat ? pc / squat : 0;
  const findings: { title: string; text: string; recs: string }[] = [];
  if (powerRatio) findings.push(powerRatio < 0.7
    ? { title: "Power Deficit Detected", text: "The model suggests you produce force well but may struggle to express it explosively.", recs: "Olympic lifting, jump squats, sprinting, ballistic movements, high-velocity lifting." }
    : { title: "Strength Deficit Detected", text: "The model suggests your explosive expression is solid relative to your max strength.", recs: "Heavy squats, front squats, and max strength work." });
  if (sj && cmj && (cmj - sj < Math.max(2, sj * 0.1))) findings.push({ title: "Low Stretch Shortening Cycle Utilization", text: "Countermovement jump is not much higher than squat jump.", recs: "Extensive plyometrics, basic intensive plyometrics, high-velocity lifting." });
  if (cmj && dj && (dj - cmj < Math.max(2, cmj * 0.1))) findings.push({ title: "High Stretch Shortening Cycle Deficit", text: "Drop jump is not much higher than countermovement jump.", recs: "Intensive plyometrics, depth jumps, reactive jumps, eccentric-focused training." });
  if (!findings.length) findings.push({ title: "Balanced Athlete", text: "No major deficit is flagged by this app model.", recs: "Maintain all qualities with a long conjugate sequence and one primary focus each block." });
  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Athletic Analysis</p><p className="text-xs text-muted-foreground mt-1">These are recommendations from the app model, not absolute scientific conclusions.</p></div>
      <div className="grid grid-cols-2 gap-3">
        <input value={lifts.powerClean} onChange={e => setLift("powerClean", e.target.value)} type="number" placeholder="Power Clean" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none" />
        <input value={lifts.deepBackSquat} onChange={e => setLift("deepBackSquat", e.target.value)} type="number" placeholder="Deep Back Squat" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none" />
      </div>
      <div className="grid md:grid-cols-2 gap-3">{findings.map(f => <div key={f.title} className="bg-background border border-border rounded-xl p-4"><p className="text-primary font-black mb-1">{f.title}</p><p className="text-sm text-muted-foreground mb-2">{f.text}</p><p className="text-sm">{f.recs}</p></div>)}</div>
    </div>
  );
}

function HoursManager({ data, onUpdate }: { data: AppData; onUpdate: (d: AppData) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [hours, setHours] = useState("");
  function save() {
    const minutes = Math.round((parseFloat(hours) || 0) * 60);
    if (!minutes) return;
    const sessions = [...data.sessions];
    const idx = sessions.findIndex(s => s.date === date);
    if (idx >= 0) sessions[idx] = { date, minutes }; else sessions.push({ date, minutes });
    onUpdate({ ...data, sessions: sessions.sort((a,b)=>a.date.localeCompare(b.date)) });
    setHours("");
  }
  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Training Hours</p>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none"/><input type="number" value={hours} onChange={e=>setHours(e.target.value)} placeholder="Hours" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none"/><button onClick={save} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold">Save</button></div>
      <div className="space-y-2">{[...data.sessions].reverse().slice(0,10).map(s=><div key={s.date} className="flex justify-between items-center border-b border-border pb-2 text-sm"><span>{shortDate(s.date)}</span><span>{Math.round(s.minutes/60*10)/10} hr</span><button onClick={()=>onUpdate({...data,sessions:data.sessions.filter(x=>x.date!==s.date)})} className="text-muted-foreground hover:text-destructive">Delete</button></div>)}</div>
    </div>
  );
}

function WorkoutPlanner({ data, onUpdate }: { data: AppData; onUpdate: (d: AppData) => void }) {
  const plan = data.workoutPlan?.length ? data.workoutPlan : defaultWorkoutPlan();
  const [active, setActive] = useState(false), [paused, setPaused] = useState(false);
  const [idx, setIdx] = useState(0), [remaining, setRemaining] = useState(0), [doneSec, setDoneSec] = useState(0);
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const endAtRef = useRef(0);
  const startRemainingRef = useRef(0);
  const totalSec = plan.reduce((a,b)=>a + Math.max(0, Number(b.minutes)||0) * 60, 0);
  const current = plan[idx], next = plan[idx + 1];
  const completedSec = doneSec + (active && current ? Math.max(0, startRemainingRef.current - remaining) : 0);
  const pct = totalSec ? Math.min(100, Math.round((completedSec / totalSec) * 100)) : 0;
  const totalLeft = Math.max(0, remaining + plan.slice(idx + 1).reduce((a,b)=>a + b.minutes * 60, 0));
  const setBlock = (id: string, patch: Partial<WorkoutBlock>) => onUpdate({ ...data, workoutPlan: plan.map(b => b.id === id ? { ...b, ...patch } : b) });
  const addBlock = () => onUpdate({ ...data, workoutPlan: [...plan, { id: crypto.randomUUID(), activity: "New Drill", minutes: 10, notes: "" }] });
  const removeBlock = (id: string) => onUpdate({ ...data, workoutPlan: plan.filter(b => b.id !== id) });
  function startBlock(i: number) {
    const sec = Math.max(1, (plan[i]?.minutes || 0) * 60);
    setIdx(i); setRemaining(sec); startRemainingRef.current = sec; endAtRef.current = Date.now() + sec * 1000;
  }
  async function startWorkout() {
    if (!plan.length) return;
    await workoutNotify("Workout started", plan[0].activity);
    setSummary(null); setDoneSec(0); setPaused(false); setActive(true); startBlock(0);
  }
  function logWorkout(minutes: number, completionPct: number) {
    const today = new Date().toISOString().slice(0,10);
    const sessions = [...data.sessions];
    const existing = sessions.find(s => s.date === today);
    if (existing) existing.minutes += minutes; else sessions.push({ date: today, minutes });
    const sum: WorkoutSummary = { id: crypto.randomUUID(), date: today, totalMinutes: Math.round(totalSec / 60), completedMinutes: minutes, completionPct, blocks: plan };
    onUpdate({ ...data, sessions, workoutPlan: plan, workoutHistory: [sum, ...(data.workoutHistory || [])].slice(0, 20) });
    setSummary(sum);
  }
  async function finishWorkout(early = false) {
    const finalSec = early ? completedSec : totalSec;
    const minutes = Math.max(1, Math.round(finalSec / 60));
    const completionPct = totalSec ? Math.min(100, Math.round((finalSec / totalSec) * 100)) : 0;
    setActive(false); setPaused(false); setRemaining(0);
    logWorkout(minutes, completionPct);
    await workoutNotify(early ? "Workout ended" : "Workout complete", `${minutes} minutes logged`);
  }
  async function completeCurrent() {
    const block = plan[idx];
    const newDone = doneSec + startRemainingRef.current;
    setDoneSec(newDone);
    await workoutNotify(`${block.activity} complete`, next ? `Next: ${next.activity}` : "Workout complete");
    if (idx + 1 >= plan.length) { setTimeout(() => finishWorkout(false), 0); return; }
    startBlock(idx + 1);
  }
  function skip() { setDoneSec(doneSec + Math.max(0, startRemainingRef.current - remaining)); if (idx + 1 >= plan.length) void finishWorkout(true); else startBlock(idx + 1); }
  function addTime() { const nextRemaining = remaining + 300; setRemaining(nextRemaining); startRemainingRef.current += 300; endAtRef.current = Date.now() + nextRemaining * 1000; }
  function togglePause() { if (!active) return; if (paused) { endAtRef.current = Date.now() + remaining * 1000; setPaused(false); } else setPaused(true); }
  useEffect(() => {
    if (!active || paused) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) void completeCurrent();
    };
    tick();
    const id = setInterval(tick, 500);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [active, paused, idx, doneSec, plan]);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Today's Workout</p><p className="text-sm text-muted-foreground">{Math.round(totalSec/60)} min planned</p></div>{!active&&<button onClick={startWorkout} className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-semibold">Start Workout</button>}</div>
      {!active && <div className="space-y-2">{plan.map(b=><div key={b.id} className="grid grid-cols-1 md:grid-cols-[1.4fr_.6fr_1.5fr_auto] gap-2"><input value={b.activity} onChange={e=>setBlock(b.id,{activity:e.target.value})} className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none"/><input value={b.minutes} onChange={e=>setBlock(b.id,{minutes:Number(e.target.value)||0})} type="number" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none"/><input value={b.notes||""} onChange={e=>setBlock(b.id,{notes:e.target.value})} placeholder="Notes" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none"/><button onClick={()=>removeBlock(b.id)} className="text-muted-foreground hover:text-destructive px-3">Delete</button></div>)}<button onClick={addBlock} className="text-sm text-primary font-semibold">Add Block</button></div>}
      {active && current && <div className="space-y-4">
        <div className="bg-background border border-border rounded-xl p-5 text-center"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Current Drill</p><p className="text-2xl font-black text-primary">{current.activity}</p><p className="text-6xl font-black tabular-nums mt-3" style={{fontFamily:"'DM Mono',monospace"}}>{formatTime(remaining)}</p>{current.notes&&<p className="text-sm text-muted-foreground mt-2">{current.notes}</p>}</div>
        <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{width:`${pct}%`}} /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><div><p className="text-muted-foreground">Next</p><p>{next?.activity || "Finish"}</p></div><div><p className="text-muted-foreground">Total Left</p><p>{formatTime(totalLeft)}</p></div><div><p className="text-muted-foreground">Completed</p><p>{pct}%</p></div><div><p className="text-muted-foreground">Block</p><p>{idx + 1} / {plan.length}</p></div></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2"><button onClick={togglePause} className="bg-secondary rounded-xl py-2 text-sm font-semibold">{paused ? "Resume" : "Pause"}</button><button onClick={skip} className="bg-secondary rounded-xl py-2 text-sm font-semibold">Skip Drill</button><button onClick={addTime} className="bg-secondary rounded-xl py-2 text-sm font-semibold">+5 Min</button><button onClick={()=>void finishWorkout(true)} className="bg-secondary rounded-xl py-2 text-sm font-semibold text-destructive">End Early</button></div>
      </div>}
      {summary && <div className="bg-background border border-border rounded-xl p-4"><p className="font-black text-primary mb-1">Workout Summary</p><p className="text-sm">Completed {summary.completedMinutes} of {summary.totalMinutes} planned minutes ({summary.completionPct}%). Basketball hours were added to training history.</p></div>}
    </div>
  );
}

function TrainingView({ data, onUpdate }: { data: AppData; onUpdate: (d: AppData) => void }) {
  const weeklyData = Array.from({ length: 8 }, (_, wi) => {
    const wS = 7 * (7 - wi), wE = wS - 7;
    const total = data.sessions.filter(s => { const ago = Math.floor((Date.now() - new Date(s.date + "T12:00:00").getTime()) / 86400000); return ago < wS && ago >= wE; }).reduce((a, b) => a + b.minutes, 0);
    return { week: `W${wi + 1}`, minutes: total };
  });
  const monthlyShots = Array.from({ length: 6 }, (_, mi) => {
    const now = new Date(), md = new Date(now.getFullYear(), now.getMonth() - (5 - mi), 1);
    const lbl = md.toLocaleDateString("en-US", { month: "short" });
    const inM = data.shots.filter(s => { const d = new Date(s.date + "T12:00:00"); return d.getFullYear() === md.getFullYear() && d.getMonth() === md.getMonth(); });
    const made = inM.reduce((a, b) => a + b.made, 0), att = inM.reduce((a, b) => a + b.attempted, 0);
    return { month: lbl, pct: att > 0 ? Math.round((made / att) * 100) : null };
  });
  const avgPct = shootingPct(data.shots);
  const heatBg = ["#1e1e20","rgba(21,148,71,0.2)","rgba(21,148,71,0.4)","rgba(21,148,71,0.7)","#159447"];
  return (
    <div className="space-y-6">
      <ViewHero img="1519861531473-9200262188bf" title="Training" sub="Long-term progress" />
      <WorkoutPlanner data={data} onUpdate={onUpdate} />
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5"><Clock size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Weekly Volume (last 8 weeks)</span></div>
        <div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart id="t-weekly" data={weeklyData} barSize={28} margin={{ top:4,right:4,bottom:0,left:-20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="week" tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} unit=" m" />
          <Tooltip content={<ChartTip unit=" min" />} cursor={{ fill:"rgba(21,148,71,0.07)" }} />
          <Bar name="weekly-min" dataKey="minutes" fill="#159447" radius={[6,6,0,0]} />
        </BarChart></ResponsiveContainer></div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5"><Target size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Shooting % (last 6 months)</span></div>
        <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart id="t-monthly" data={monthlyShots} margin={{ top:4,right:4,bottom:0,left:-20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="month" tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0,100]} tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} unit="%" />
          <ReferenceLine y={avgPct} stroke="rgba(21,148,71,0.3)" strokeDasharray="4 4" />
          <Tooltip content={<ChartTip unit="%" />} cursor={{ stroke:"rgba(21,148,71,0.2)",strokeWidth:1 }} />
          <Line name="monthly-pct" type="monotone" dataKey="pct" stroke="#159447" strokeWidth={2.5} connectNulls dot={{ fill:"#159447",r:4,strokeWidth:0 }} activeDot={{ r:6,fill:"#159447" }} />
        </LineChart></ResponsiveContainer></div>
        <p className="text-xs text-muted-foreground mt-3">Dashed = all-time avg ({avgPct}%)</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5"><TrendingUp size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Last 30 Days</span></div>
        <div className="grid grid-cols-10 gap-1.5">{data.sessions.slice(-30).map((s,i)=>{ const lvl=s.minutes===0?0:s.minutes<30?1:s.minutes<60?2:s.minutes<90?3:4; return <div key={i} title={`${shortDate(s.date)}: ${s.minutes} min`} className="h-7 rounded" style={{ background:heatBg[lvl] }} />; })}</div>
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground"><span>Less</span>{heatBg.map((bg,i)=><div key={i} className="h-3 w-5 rounded" style={{ background:bg }} />)}<span>More</span></div>
      </div>
    </div>
  );
}

// ─── Strength View ────────────────────────────────────────────────────────────
function StrengthView({ data, onUpdate, userId }: { data: AppData; onUpdate: (d: AppData) => void; userId: string }) {
  const [sel, setSel] = useState(0), [adding, setAdding] = useState(false), [wt, setWt] = useState(""), [rp, setRp] = useState(""), [note, setNote] = useState(""), [prVideo, setPrVideo] = useState<File | null>(null), [addEx, setAddEx] = useState(false), [exName, setExName] = useState("");
  const ex = data.strength[Math.min(sel, data.strength.length-1)];
  const saveEntry = async () => { const w=parseFloat(wt),r=parseInt(rp); if(!w||!r)return; const videoUrl = prVideo ? await uploadUserAsset("pr-videos", userId, prVideo, "mp4").catch(()=>"") : ""; onUpdate({...data,strength:data.strength.map((e,i)=>i===sel?{...e,history:[...e.history,{date:new Date().toISOString().slice(0,10),weight:w,reps:r,est1rm:est1rm(w,r),notes:note.trim(),videoUrl}]}:e)}); setWt(""); setRp(""); setNote(""); setPrVideo(null); setAdding(false); };
  const saveEx = () => { if(!exName.trim())return; const nd={...data,strength:[...data.strength,{name:exName.trim(),unit:"lbs" as const,history:[]}]}; onUpdate(nd); setSel(nd.strength.length-1); setExName(""); setAddEx(false); };
  const graphData = ex.history.map(h=>({date:shortDate(h.date),weight:h.weight,est1rm:h.est1rm || est1rm(h.weight,h.reps)}));
  const best = ex.history.length?Math.max(...ex.history.map(h=>h.weight)):0;
  const bestEst = ex.history.length?Math.max(...ex.history.map(h=>h.est1rm || est1rm(h.weight,h.reps))):0;
  const last = ex.history.length?ex.history[ex.history.length-1].weight:null;
  return (
    <div className="space-y-6">
      <ViewHero img="1581009146145-b5ef050c2e1e" title="Strength" sub="Track your lifts" />
      <FlightTimeTool />
      <JumpTestingSection data={data} onUpdate={onUpdate} />
      <AthleticAnalysisSection data={data} onUpdate={onUpdate} />
      <div className="bg-card border border-border rounded-2xl p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Best Estimated 1RM</p><p className="text-3xl font-black text-primary" style={{fontFamily:"'Roboto Slab',serif"}}>{bestEst ? `${bestEst} ${ex.unit}` : "-"}</p></div>
      <div className="flex flex-wrap gap-2">
        {data.strength.map((e,i)=><button key={i} onClick={()=>{setSel(i);setAdding(false);}} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${i===sel?"bg-primary text-primary-foreground":"bg-secondary text-secondary-foreground hover:bg-muted"}`}>{e.name}</button>)}
        {addEx?(<div className="flex items-center gap-2"><input autoFocus value={exName} onChange={e=>setExName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEx()} placeholder="Exercise name" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none w-36" /><button onClick={saveEx} className="bg-primary text-primary-foreground rounded-xl p-2"><Check size={14}/></button><button onClick={()=>{setAddEx(false);setExName("");}} className="bg-secondary rounded-xl p-2"><X size={14}/></button></div>)
        :<button onClick={()=>setAddEx(true)} className="px-4 py-2 rounded-xl text-sm bg-secondary text-muted-foreground hover:text-foreground flex items-center gap-1.5"><Plus size={13}/> Add lift</button>}
      </div>
      <div className="grid grid-cols-3 gap-4">{[{l:"Best",v:best?`${best} ${ex.unit}`:"—"},{l:"Last",v:last!==null?`${last} ${ex.unit}`:"—"},{l:"Sessions",v:String(ex.history.length)}].map(s=>(<div key={s.l} className="bg-card border border-border rounded-2xl p-4"><p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{s.l}</p><p className="text-2xl font-black text-primary" style={{fontFamily:"'Roboto Slab',serif"}}>{s.v}</p></div>))}</div>
      {graphData.length>=2?(<div className="bg-card border border-border rounded-2xl p-6"><div className="flex items-center gap-2 mb-5"><TrendingUp size={14} className="text-primary"/><span className="text-xs uppercase tracking-wider text-muted-foreground">{ex.name} — Weight Over Time</span></div><div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart id="s-strength" data={graphData} margin={{top:4,right:4,bottom:0,left:-10}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/><XAxis dataKey="date" tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false} unit={` ${ex.unit}`}/><Tooltip content={<ChartTip unit={` ${ex.unit}`}/>} cursor={{stroke:"rgba(21,148,71,0.2)",strokeWidth:1}}/><Line name="strength-weight" type="monotone" dataKey="weight" stroke="#159447" strokeWidth={2.5} dot={{fill:"#159447",r:4,strokeWidth:0}} activeDot={{r:6,fill:"#159447"}}/></LineChart></ResponsiveContainer></div></div>)
      :<div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">Log at least 2 sessions to see your chart.</div>}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4"><span className="text-xs uppercase tracking-wider text-muted-foreground">History</span>{!adding&&<button onClick={()=>setAdding(true)} className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent"><Plus size={12}/> Log today</button>}</div>
        {adding&&(<div className="grid md:grid-cols-[1fr_1fr_2fr_auto] gap-3 mb-4 p-3 bg-secondary rounded-xl"><div><label className="text-xs text-muted-foreground block mb-1">Weight ({ex.unit})</label><input autoFocus value={wt} onChange={e=>setWt(e.target.value)} type="number" placeholder="225" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none"/></div><div><label className="text-xs text-muted-foreground block mb-1">Reps</label><input value={rp} onChange={e=>setRp(e.target.value)} type="number" placeholder="5" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none"/></div><div><label className="text-xs text-muted-foreground block mb-1">Notes / PR video</label><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Notes" className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none mb-2"/><input type="file" accept="video/*" onChange={e=>setPrVideo(e.target.files?.[0]||null)} className="text-xs w-full"/></div><div className="flex gap-2 items-end"><button onClick={saveEntry} className="bg-primary text-primary-foreground rounded-lg p-3 hover:bg-accent"><Check size={15}/></button><button onClick={()=>setAdding(false)} className="bg-muted rounded-lg p-3"><X size={15}/></button></div></div>)}
        {ex.history.length===0?<p className="text-muted-foreground text-sm text-center py-4">No entries yet.</p>:(<div>{[...ex.history].reverse().map((h,i)=>(<div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0"><span className="text-sm text-muted-foreground">{shortDate(h.date)}</span><div className="flex gap-4"><span className="text-sm">{h.reps} reps</span><span className="text-sm font-semibold text-primary">{h.weight} {ex.unit}</span></div></div>))}</div>)}
      </div>
      <div className="bg-card border border-border rounded-2xl p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Estimated 1RM History</p>
        {ex.history.length===0?<p className="text-muted-foreground text-sm">No PRs yet.</p>:<div className="space-y-3">{[...ex.history].reverse().map((h,i)=><div key={i} className="border-b border-border pb-3 last:border-0"><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{shortDate(h.date)} - {h.weight} x {h.reps}</span><span className="text-primary font-semibold">Estimated 1RM {h.est1rm || est1rm(h.weight,h.reps)} {ex.unit}</span></div>{h.notes&&<p className="text-xs text-muted-foreground mt-1">{h.notes}</p>}{h.videoUrl&&<video src={h.videoUrl} controls className="mt-2 w-full max-h-56 rounded-xl bg-black object-contain"/>}</div>)}</div>}
      </div>
    </div>
  );
}

// ─── Editable Measurables ────────────────────────────────────────────────────
function EditableMeasurables({ profile, userId, onSave }: { profile: UserProfile; userId: string; onSave: (u: Partial<UserProfile>) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ firstName: profile.firstName, lastName: profile.lastName, avatarUrl: profile.avatarUrl || "", height: profile.height, weight: profile.weight, wingspan: profile.wingspan, vertical: profile.vertical, position: profile.position, gradYear: profile.gradYear });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const cls = "bg-muted border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary w-full";

  function save() {
    const firstName = sanitizeText(form.firstName);
    const lastName = sanitizeText(form.lastName);
    if (!firstName || !lastName) return;
    onSave({ ...form, firstName, lastName, avatarUrl: sanitizeImageUrl(form.avatarUrl) });
    setEditing(false);
  }

  if (!editing) {
    const metrics = [
      { l: "Height", v: profile.height },
      { l: "Weight", v: profile.weight ? `${profile.weight} lbs` : "" },
      { l: "Wingspan", v: profile.wingspan },
      { l: "Vertical", v: profile.vertical ? `${profile.vertical}"` : "" },
    ].filter(m => m.v);

    return (
      <div className="bg-card border border-border rounded-2xl px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Profile</span>
            {isAdmin(profile) && <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md">Admin</span>}
            <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-md">{profile.position}</span>
            {profile.gradYear && <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">Class of {profile.gradYear}</span>}
          </div>
          <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/10">Edit ✏️</button>
        </div>
        {metrics.length > 0 ? (
          <div className="grid grid-cols-4 gap-4 text-center">
            {metrics.map(m => <div key={m.l}><p className="text-xl font-black leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{m.v}</p><p className="text-xs text-muted-foreground mt-1">{m.l}</p></div>)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-1">Tap Edit to add your measurables</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Edit Profile</span>
        <div className="flex gap-2">
          <button onClick={() => setEditing(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg bg-secondary">Cancel</button>
          <button onClick={save} className="text-xs font-semibold text-primary-foreground bg-primary px-3 py-1.5 rounded-lg hover:bg-accent">Save</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">First Name</label>
          <input value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="First name" className={cls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Last Name</label>
          <input value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Last name" className={cls} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Profile Image</label>
          <input type="file" accept="image/*" onChange={async e => { const f=e.target.files?.[0]; if(f) set("avatarUrl", await uploadUserAsset("profile-images", userId, f, "jpg").catch(() => form.avatarUrl)); }} className={cls} />
          {form.avatarUrl && <p className="text-xs text-primary mt-1">Profile image selected</p>}
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Position</label>
          <select value={form.position} onChange={e => set("position", e.target.value)} className={cls}>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Grad Year</label>
          <select value={form.gradYear} onChange={e => set("gradYear", e.target.value)} className={cls}>
            {GRAD_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {[
          { k: "height", l: "Height", ph: '6\'2"' },
          { k: "weight", l: "Weight (lbs)", ph: "185" },
          { k: "wingspan", l: "Wingspan", ph: '6\'5"' },
          { k: "vertical", l: "Vertical (in)", ph: "34" },
        ].map(({ k, l, ph }) => (
          <div key={k}>
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">{l}</label>
            <input value={(form as any)[k]} onChange={e => set(k, e.target.value)} placeholder={ph} className={cls} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [data, setData] = useState<AppData>(emptyData());
  const [view, setView] = useState<View>("home");
  const [timerOn, setTimerOn] = useState(false), [timerSec, setTimerSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartedAtRef = useRef<number | null>(null);
  const timerBaseSecRef = useRef(0);
  const [shotMade, setShotMade] = useState(0), [shotAtt, setShotAtt] = useState(0), [shotMode, setShotMode] = useState(false);
  const [streakPulse, setStreakPulse] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sharedPlayer, setSharedPlayer] = useState<CommunityPlayer | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const playerIdParam = urlParams.get("player");
  const viewParam = urlParams.get("view");

  useEffect(() => {
    if (playerIdParam) {
      Promise.all([
        apiFetch<{ profile: UserProfile | null }>(`/profile/${playerIdParam}`, { profile: null }),
        apiFetch<{ data: AppData | null }>(`/gamedata/${playerIdParam}`, { data: null }),
      ]).then(([profileRes, dataRes]) => {
        if (!profileRes.profile) return;
        const sessions = dataRes.data?.sessions || [], shots = dataRes.data?.shots || [];
        const made = shots.reduce((a, b) => a + b.made, 0), attempted = shots.reduce((a, b) => a + b.attempted, 0);
        setSharedPlayer({ userId: playerIdParam, profile: withRole(profileRes.profile), summary: { streak:dataRes.data?.streak || 0, shootingPct:attempted ? Math.round((made / attempted) * 100) : 0, totalMinutes:sessions.reduce((a, b) => a + b.minutes, 0), activeDays:sessions.filter(s => s.minutes > 0).length } });
      });
    }
  }, [playerIdParam]);

  useEffect(() => {
    async function loadUser(uid: string, email: string) {
      setCloudLoaded(false);
      setUserId(uid); setUserEmail(email);
      // 1. Try localStorage first (instant)
      const lp = localProfile(uid);
      const ld = localData(uid);
      if (lp) {
        const local = withRole({ ...lp, email: lp.email || email });
        setProfile(local); setData(ld || emptyData()); setAuthState("ready");
        // Check unread notifications
        fetchNotifs(uid).then(n => setUnreadCount(n.filter((x: any) => !x.read).length)).catch(() => {});
      }
      // 2. Fetch from server (new device or cleared cache)
      try {
        const [profileRes, dataRes] = await Promise.all([
          apiFetch<{ profile: UserProfile | null }>(`/profile/${uid}`, { profile: null }),
          apiFetch<{ data: AppData | null }>(`/gamedata/${uid}`, { data: null }),
        ]);
        const serverProfile = profileRes.profile ? withRole({ ...profileRes.profile, email: profileRes.profile.email || email }) : null;
        if (serverProfile) {
          const cloudData = dataRes.data || ld || emptyData();
          clearPendingProfile(uid);
          if (dataRes.data) clearPendingData(uid);
          saveLocalProfile(serverProfile);
          saveLocalData(uid, cloudData);
          setProfile(serverProfile);
          setData(cloudData);
          setAuthState("ready");
          setCloudLoaded(true);
          return;
        }
        if (lp) {
          await saveProfileCloud(uid, withRole({ ...lp, email: lp.email || email }));
          if (ld) await saveDataCloud(uid, ld);
          setCloudLoaded(true);
          return;
        }
      } catch { if (lp) { setCloudLoaded(true); return; } }
      // 3. No profile found anywhere — new user needs to set up
      setAuthState("needs_profile");
      setCloudLoaded(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setAuthState("unauthenticated");
        setUserId(null); setProfile(null);
        setCloudLoaded(false);
        return;
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
        loadUser(session.user.id, session.user.email || "");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId || !cloudLoaded) return;
    const retry = () => { void flushPendingSync(userId); };
    window.addEventListener("focus", retry);
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    retry();
    return () => {
      window.removeEventListener("focus", retry);
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [userId, cloudLoaded]);

  function currentTimerSec() {
    if (!timerOn || timerStartedAtRef.current === null) return timerSec;
    return timerBaseSecRef.current + Math.max(0, Math.floor((Date.now() - timerStartedAtRef.current) / 1000));
  }
  function syncTimer() {
    const next = currentTimerSec();
    setTimerSec(next);
    return next;
  }
  function startTimer() {
    timerBaseSecRef.current = timerSec;
    timerStartedAtRef.current = Date.now();
    setTimerOn(true);
  }
  function pauseTimer() {
    const next = syncTimer();
    timerBaseSecRef.current = next;
    timerStartedAtRef.current = null;
    setTimerOn(false);
  }
  function resetTimer() {
    timerBaseSecRef.current = 0;
    timerStartedAtRef.current = null;
    setTimerOn(false);
    setTimerSec(0);
  }

  useEffect(() => {
    if (!timerOn) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    const update = () => { syncTimer(); };
    update();
    timerRef.current = setInterval(update, 1000);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [timerOn]);

  const updateData = useCallback((nd: AppData) => {
    setData(nd);
    if (userId) void saveDataCloud(userId, nd);
  }, [userId]);

  function handleProfileComplete(p: UserProfile) {
    const np = withRole(p);
    setProfile(np); setData(emptyData()); void saveProfileCloud(np.userId, np); void saveDataCloud(np.userId, emptyData()); setAuthState("ready");
  }
  async function handleLogout() { await supabase.auth.signOut(); setUserId(null); setProfile(null); setData(emptyData()); setAuthState("unauthenticated"); }
  async function copyShareLink() {
    if (!userId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("player", userId); url.searchParams.delete("view");
    const shareUrl = url.toString();
    try {
      if (navigator.share) await navigator.share({ title: `${profile?.firstName || "Player"} on ${APP_NAME}`, url: shareUrl });
      else await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true); setTimeout(() => setShareCopied(false), 1800);
    } catch {
      window.prompt("Copy your profile link:", shareUrl);
    }
  }
  function saveSession() {
    const savedSec = syncTimer();
    if (savedSec < 60) return;
    const min = Math.floor(savedSec / 60), today = new Date().toISOString().slice(0,10);
    const nd = { ...data, sessions: [...data.sessions] };
    const idx = nd.sessions.findIndex(s => s.date === today);
    if (idx >= 0) nd.sessions[idx].minutes += min; else nd.sessions = [...nd.sessions, { date: today, minutes: min }];
    const yest = makeDate(1);
    if (nd.lastPracticeDate !== today) { nd.streak = nd.lastPracticeDate === yest ? nd.streak + 1 : 1; setStreakPulse(true); setTimeout(() => setStreakPulse(false), 800); }
    nd.lastPracticeDate = today; updateData(nd); resetTimer();
  }
  function saveShots() {
    if (shotAtt === 0 || shotMade > shotAtt) return;
    const today = new Date().toISOString().slice(0, 10);
    const nd = { ...data, shots: [...data.shots] };
    const idx = nd.shots.findIndex(s => s.date === today);
    if (idx >= 0) {
      nd.shots[idx] = { ...nd.shots[idx], made: nd.shots[idx].made + shotMade, attempted: nd.shots[idx].attempted + shotAtt };
    } else {
      nd.shots = [...nd.shots, { made: shotMade, attempted: shotAtt, date: today }];
    }
    updateData(nd);
    setShotMade(0); setShotAtt(0); setShotMode(false);
  }

  // Public routes
  if (playerIdParam && sharedPlayer) return <PlayerProfileView player={sharedPlayer} />;
  if (playerIdParam && !sharedPlayer && authState !== "loading") return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Player not found.</div>;
  if (viewParam === "community") return <CommunityPage currentUserId={userId ?? undefined} currentProfile={profile} />;

  // Auth states
  if (authState === "loading") return <div className="min-h-screen bg-background flex items-center justify-center"><div className="flex flex-col items-center gap-4"><span className="text-4xl animate-bounce">🏀</span><p className="text-muted-foreground text-sm">Loading…</p></div></div>;
  if (authState === "unauthenticated") return <LoginScreen />;
  if (authState === "needs_profile" && userId) return <ProfileSetup userId={userId} email={userEmail} onComplete={handleProfileComplete} />;
  if (!profile) return null;

  const pct = shootingPct(data.shots);
  const totalMade = data.shots.reduce((a,b)=>a+b.made,0), totalAtt = data.shots.reduce((a,b)=>a+b.attempted,0);
  const graphData = lastDays(7).map(date => ({ date: shortDate(date), minutes: data.sessions.find(s => s.date === date)?.minutes || 0 }));
  const shotDailyData = lastDays(7).map(date => {
    const s = data.shots.find(x => x.date === date);
    return { date: shortDate(date), made: s?.made || 0, attempted: s?.attempted || 0 };
  });
  const todayMin = (()=>{ const t=new Date().toISOString().slice(0,10); return data.sessions.find(s=>s.date===t)?.minutes||0; })();
  const todayShots = (()=>{ const t=new Date().toISOString().slice(0,10); return data.shots.find(s=>s.date===t) || { made: 0, attempted: 0, date: t }; })();
  const viewLabels: Record<View,string> = { home:"Home",training:"Training",strength:"Strength",community:"Community" };
  const totalMinutes = data.sessions.reduce((a, b) => a + b.minutes, 0);
  const rank = getRank(totalMinutes);
  const nextRank = getNextRank(totalMinutes);
  const navCards = [
    { key:"strength" as View, label:"Strength", sub:"Track your lifts", img:"1581009146145-b5ef050c2e1e", Icon:Dumbbell },
    { key:"training" as View, label:"Training", sub:"Long-term graphs", img:"1519861531473-9200262188bf", Icon:TrendingUp },
    { key:"community" as View, label:"Community", sub:"Feed & players", img:"1546519638-68e109498ffc", Icon:Users },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <header className="border-b border-border px-6 py-5 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          {view!=="home"&&<button onClick={()=>setView("home")} className="mr-1 text-muted-foreground hover:text-foreground"><ChevronLeft size={20}/></button>}
          <span className="text-2xl">🏀</span>
          <div><h1 className="text-xl font-black tracking-tight leading-none" style={{fontFamily:"'Roboto Slab',serif"}}>{profile.firstName.toUpperCase()} {profile.lastName.toUpperCase()}</h1><p className="text-xs text-muted-foreground uppercase tracking-widest">{viewLabels[view]}</p></div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={copyShareLink} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">{shareCopied ? <Check size={13}/> : <ExternalLink size={13}/>} {shareCopied ? "Copied" : "Share"}</button>
          <button onClick={()=>setView("community")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"><Users size={13}/> Community</button>
          {/* Notification bell */}
          <button onClick={() => setShowNotifs(true)} className="relative text-muted-foreground hover:text-primary transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-bold">{unreadCount > 9 ? "9+" : unreadCount}</span>}
          </button>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><LogOut size={13}/> Sign Out</button>
        </div>
      </header>
      {showNotifs && userId && <NotifPanel userId={userId} onClose={() => { setShowNotifs(false); setUnreadCount(0); }} />}

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {view==="training" && <TrainingView data={data} onUpdate={updateData}/>}
        {view==="strength" && userId && <StrengthView data={data} onUpdate={updateData} userId={userId}/>}
        {view==="community" && <CommunityPage currentUserId={userId??undefined} currentProfile={profile} onBack={()=>setView("home")}/>}

        {view==="home" && <>
          <div className="relative rounded-2xl overflow-hidden h-48 bg-zinc-900">
            <img src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=400&fit=crop&auto=format" alt="Court" className="w-full h-full object-cover opacity-60"/>
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent flex items-end p-6">
              <div><p className="text-xs uppercase tracking-widest text-primary font-medium mb-1">{APP_NAME}</p><h2 className="text-3xl font-black text-white leading-none" style={{fontFamily:"'Roboto Slab',serif"}}>Keep going, {profile.firstName}.</h2></div>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <span className="bg-black/50 rounded-lg px-2 py-1 text-xs text-primary font-medium">{profile.position}</span>
              <span className="bg-black/50 rounded-lg px-2 py-1 text-xs text-muted-foreground">Class of {profile.gradYear}</span>
            </div>
          </div>

          {/* Rank card */}
          <div className="bg-card border border-border rounded-2xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{rank.emoji}</span>
              <div>
                <p className="font-black text-lg leading-none" style={{ color: rank.color, fontFamily: "'Roboto Slab',serif" }}>{rank.label}</p>
                <p className="text-xs text-muted-foreground">{Math.round(totalMinutes / 60)} hrs total</p>
              </div>
            </div>
            {nextRank ? (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Next: {nextRank.emoji} {nextRank.label}</p>
                <p className="text-xs text-muted-foreground">{Math.max(0, Math.round(nextRank.hours - totalMinutes / 60))} hrs to go</p>
                <div className="h-1.5 w-28 bg-muted rounded-full overflow-hidden mt-1.5">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ((totalMinutes / 60 - rank.hours) / (nextRank.hours - rank.hours)) * 100)}%`, background: rank.color }} />
                </div>
              </div>
            ) : <p className="text-xs text-primary font-semibold">Max Rank! 💎</p>}
          </div>

          {/* Measurables with edit */}
          <EditableMeasurables profile={profile} userId={userId!} onSave={updated => {
            const np = withRole({ ...profile, ...updated });
            setProfile(np);
            void saveProfileCloud(userId!, np);
          }} />

          <div className="grid grid-cols-3 gap-4">
            {[
              {Icon:Flame, label:"Practice Streak",big:String(data.streak),unit:"days",sub:data.streak>=7?"Week+ streak! 🔥":`${7-data.streak} days to a week`,pulse:streakPulse},
              {Icon:Target,label:"Shots Today",big:String(todayShots.made),unit:`/ ${todayShots.attempted}`,sub:`${totalMade} / ${totalAtt} all-time`,pulse:false},
              {Icon:Clock, label:"Today",big:String(todayMin),unit:"min",sub:"practiced today",pulse:false},
            ].map(({Icon,label,big,unit,sub,pulse})=>(
              <div key={label} className={`bg-card border border-border rounded-2xl p-5 transition-all ${pulse?"ring-2 ring-primary":""}`}>
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2"><Icon size={13} className="text-primary"/>{label}</div>
                <div className="flex items-end gap-1.5 mb-1"><span className="text-5xl font-black text-primary leading-none" style={{fontFamily:"'Roboto Slab',serif"}}>{big}</span><span className="text-muted-foreground text-sm mb-1">{unit}</span></div>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Clock size={13} className="text-primary"/> Practice Timer</div>
              <div className="flex flex-col items-center gap-4">
                <div className="text-6xl font-black tabular-nums tracking-tight" style={{fontFamily:"'DM Mono',monospace"}}>{formatTime(timerSec)}</div>
                <div className="flex gap-3">
                  <button onClick={timerOn ? pauseTimer : startTimer} className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl hover:bg-accent text-sm">{timerOn?<Pause size={16}/>:<Play size={16}/>}{timerOn?"Pause":"Start"}</button>
                  <button onClick={resetTimer} className="flex items-center gap-2 bg-secondary text-secondary-foreground font-semibold px-4 py-2.5 rounded-xl hover:bg-muted text-sm"><RotateCcw size={16}/></button>
                </div>
                <button onClick={saveSession} disabled={timerSec<60} className="w-full flex items-center justify-center gap-2 border border-primary text-primary font-semibold py-2.5 rounded-xl hover:bg-primary/10 text-sm disabled:opacity-30 disabled:cursor-not-allowed"><Check size={15}/> Save Session ({Math.floor(timerSec/60)} min)</button>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Target size={13} className="text-primary"/> Log Shots</div>
              {!shotMode?(
                <div className="flex flex-col gap-4">
                  <div className="space-y-2">{data.shots.slice(-3).reverse().map((s,i)=>(<div key={s.date} className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">{shortDate(s.date)}</span><div className="flex items-center gap-2 min-w-0"><span className="font-medium">{s.made}/{s.attempted}</span><span className="font-medium text-primary">{Math.round((s.made/s.attempted)*100)}%</span><button onClick={()=>updateData({...data,shots:data.shots.filter(x=>x.date!==s.date)})} className="text-muted-foreground hover:text-destructive">Delete</button></div></div>))}</div>
                  <button onClick={()=>setShotMode(true)} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl hover:bg-accent text-sm"><Plus size={15}/> Log New Session</button>
                </div>
              ):(
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[{lbl:"Made",val:shotMade,set:setShotMade},{lbl:"Attempted",val:shotAtt,set:setShotAtt}].map(({lbl,val,set})=>(
                      <div key={lbl} className="flex flex-col gap-1.5"><label className="text-xs text-muted-foreground uppercase tracking-wide">{lbl}</label><input value={val} onChange={e=>set(Math.max(0, Number(e.target.value)||0))} type="number" inputMode="numeric" className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-lg font-semibold text-primary outline-none"/></div>
                    ))}
                  </div>
                  {shotAtt>0&&<p className="text-center text-sm text-muted-foreground">{shotMade>shotAtt?<span className="text-destructive">Made can&apos;t exceed attempted</span>:<span>= <strong className="text-primary">{Math.round((shotMade/shotAtt)*100)}%</strong> this session</span>}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveShots} disabled={shotAtt===0||shotMade>shotAtt} className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl hover:bg-accent text-sm disabled:opacity-30"><Check size={15}/> Save</button>
                    <button onClick={()=>{setShotMode(false);setShotMade(0);setShotAtt(0);}} className="flex items-center gap-2 bg-secondary text-secondary-foreground font-semibold px-4 py-2.5 rounded-xl hover:bg-muted text-sm"><X size={15}/></button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <HoursManager data={data} onUpdate={updateData} />

          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-2"><TrendingUp size={14} className="text-primary"/><span className="text-xs uppercase tracking-wider text-muted-foreground">Daily Practice Duration</span></div><span className="text-xs text-muted-foreground">Last 7 days</span></div>
            <div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart id="h-duration" data={graphData} barSize={28} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false} unit=" m"/>
              <Tooltip content={<ChartTip unit=" min"/>} cursor={{fill:"rgba(21,148,71,0.07)"}}/>
              <Bar name="home-minutes" dataKey="minutes" fill="#159447" radius={[6,6,0,0]}/>
            </BarChart></ResponsiveContainer></div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-2"><Target size={14} className="text-primary"/><span className="text-xs uppercase tracking-wider text-muted-foreground">Daily Shot Totals</span></div><span className="text-xs text-muted-foreground">Last 7 days</span></div>
            <div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart id="h-shooting" data={shotDailyData} barSize={22} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTip/>} cursor={{fill:"rgba(21,148,71,0.07)"}}/>
              <Bar name="Made" dataKey="made" fill="#159447" radius={[6,6,0,0]}/>
              <Bar name="Attempted" dataKey="attempted" fill="#2b332d" radius={[6,6,0,0]}/>
            </BarChart></ResponsiveContainer></div>
            <p className="text-xs text-muted-foreground mt-3">All-time shooting average: {pct}%</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {navCards.map(({key,label,sub,img,Icon})=>(
              <button key={key} onClick={()=>setView(key)} className="relative rounded-xl overflow-hidden h-28 bg-zinc-900 border-none cursor-pointer p-0 text-left group w-full">
                <img src={`https://images.unsplash.com/photo-${img}?w=400&h=260&fit=crop&auto=format`} alt={label} className="w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity"/>
                <div className="absolute inset-0 p-3 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-primary"><Icon size={13}/><span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs text-white/50">{sub}</span><ArrowRight size={13} className="text-white/40 group-hover:text-primary"/></div>
                </div>
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground pb-4">Keep going, {profile.firstName}! 🏀</p>
        </>}
      </main>
    </div>
  );
}

