import { useState, useEffect, useRef, useCallback } from "react";
import {
  Flame, Target, Clock, TrendingUp, Plus, Minus, RotateCcw,
  Play, Pause, Check, X, ChevronLeft, Dumbbell, ArrowRight,
  LogOut, Users, Globe, Copy, ExternalLink, Search,
  Heart, MessageCircle, Repeat2, Quote, Trash2, Video,
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
  position: string; gradYear: string; height: string; weight: string;
  wingspan: string; vertical: string; bio: string; isPublic: boolean;
}
interface MiniProfile { firstName: string; lastName: string; position: string; }
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
interface StrengthEntry { date: string; weight: number; reps: number; }
interface StrengthExercise { name: string; unit: "lbs" | "kg"; history: StrengthEntry[]; }
interface AppData {
  streak: number; lastPracticeDate: string;
  shots: ShotEntry[]; sessions: SessionData[];
  strength: StrengthExercise[];
}

// ─── Config ───────────────────────────────────────────────────────────────────
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-4cb0fb87`;
const APP_NAME = "HOOP HUB";
const APP_TAGLINE = "Track your game. Own your grind.";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeDate(d: number) { return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10); }
function shortDate(iso: string) { return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function formatTime(s: number) { return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function shootingPct(shots: ShotEntry[]) {
  const m = shots.reduce((a, b) => a + b.made, 0), a = shots.reduce((a, b) => a + b.attempted, 0);
  return a === 0 ? 0 : Math.round((m / a) * 100);
}
function extractYTId(url: string) { const m = url.match(/(?:youtu\.be\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
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
function emptyData(): AppData { return { streak: 0, lastPracticeDate: "", shots: [], sessions: [], strength: defaultStrength() }; }
function initials(p?: MiniProfile | null) { return p ? `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase() : "?"; }

// ─── Local Storage (instant, no network) ──────────────────────────────────────
const lsGet = (k: string) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };
const lsSet = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const localProfile = (uid: string) => lsGet(`hh_profile_${uid}`);
const localData    = (uid: string) => lsGet(`hh_data_${uid}`);
const saveLocalProfile = (p: UserProfile) => lsSet(`hh_profile_${p.userId}`, p);
const saveLocalData    = (uid: string, d: AppData) => lsSet(`hh_data_${uid}`, d);

// ─── Background API (never blocks the UI) ────────────────────────────────────
const bg = (url: string, opts?: RequestInit) =>
  fetch(url, { signal: AbortSignal.timeout(6000), headers: { "Content-Type": "application/json" }, ...opts }).catch(() => {});

const bgPost = (userId: string, p: UserProfile) =>
  bg(`${SERVER}/profile`, { method: "POST", body: JSON.stringify({ userId, ...p }) });
const bgData = (userId: string, d: AppData) =>
  bg(`${SERVER}/gamedata`, { method: "POST", body: JSON.stringify({ userId, data: d }) });

async function apiFetch<T>(path: string, fallback: T): Promise<T> {
  try { const r = await fetch(`${SERVER}${path}`, { signal: AbortSignal.timeout(6000) }); return await r.json(); }
  catch { return fallback as any; }
}
async function apiPost(path: string, body: any) {
  try { const r = await fetch(`${SERVER}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) }); return await r.json(); }
  catch { return null; }
}

// ─── Chart Tip ────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, unit = "" }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="text-primary font-semibold">{payload[0].value}{unit}</p>
    </div>
  );
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
const Avatar = ({ p, size = 9 }: { p?: MiniProfile | null; size?: number }) => (
  <div className={`w-${size} h-${size} rounded-xl bg-primary/20 flex items-center justify-center text-sm font-black text-primary flex-shrink-0`} style={{ fontFamily: "'Roboto Slab',serif" }}>
    {initials(p)}
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
    {post.videoId && <div className="aspect-video rounded-lg overflow-hidden bg-zinc-900"><iframe src={`https://www.youtube.com/embed/${post.videoId}`} title="v" allowFullScreen className="w-full h-full" /></div>}
  </div>
);

// ─── Post Card ────────────────────────────────────────────────────────────────
function PostCard({ post, currentUserId, onReply, onQuote, onUpdate, onDelete, isReply = false }: {
  post: PostData; currentUserId?: string;
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
    const res = await apiPost(`/posts/${post.id}/like`, { userId: currentUserId });
    if (res) onUpdate({ ...post, likes: res.liked ? [...post.likes, currentUserId] : post.likes.filter(id => id !== currentUserId), likeCount: res.likeCount });
  }
  async function handleRepost() {
    if (!currentUserId) return;
    const res = await apiPost(`/posts/${post.id}/repost`, { userId: currentUserId });
    if (res) onUpdate({ ...post, reposts: res.reposted ? [...post.reposts, currentUserId] : post.reposts.filter(id => id !== currentUserId), repostCount: res.repostCount });
  }
  async function handleShowReplies() {
    if (showReplies) { setShowReplies(false); return; }
    setLoadingReplies(true);
    const d = await apiFetch<{ replies: PostData[] }>(`/posts/${post.id}/replies`, { replies: [] });
    setReplies(d.replies); setShowReplies(true); setLoadingReplies(false);
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
        {currentUserId === post.userId && (
          <button onClick={async () => { await bg(`${SERVER}/posts/${post.id}`, { method: "DELETE" }); onDelete(post.id); }} className="text-muted-foreground hover:text-destructive p-1"><Trash2 size={13} /></button>
        )}
      </div>
      {post.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>}
      {post.videoId && <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900"><iframe src={`https://www.youtube.com/embed/${post.videoId}`} title="clip" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" /></div>}
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
        {post.replyCount > 0 && !isReply && (
          <button onClick={handleShowReplies} className="ml-auto text-xs text-muted-foreground hover:text-primary">
            {loadingReplies ? "Loading…" : showReplies ? "Hide" : `${post.replyCount} repl${post.replyCount === 1 ? "y" : "ies"}`}
          </button>
        )}
      </div>
      {showReplies && replies.length > 0 && (
        <div className="space-y-3 pt-1">
          {replies.map(r => <PostCard key={r.id} post={r} currentUserId={currentUserId} onReply={onReply} onQuote={onQuote}
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
  const [content, setContent] = useState(""), [videoUrl, setVideoUrl] = useState(""), [showVideo, setShowVideo] = useState(false), [posting, setPosting] = useState(false);
  const videoId = extractYTId(videoUrl);
  const canPost = content.trim().length > 0 || !!videoId;

  async function submit() {
    if (!canPost || posting) return;
    setPosting(true);
    const res = await apiPost("/posts", { userId: profile.userId, content: content.trim(), videoUrl: videoId ? videoUrl : null, replyTo: replyTo?.id ?? null, quotedPostId: quotedPost?.id ?? null });
    if (res?.post) {
      res.post.profile = { firstName: profile.firstName, lastName: profile.lastName, position: profile.position };
      onPost(res.post);
    }
    setContent(""); setVideoUrl(""); setShowVideo(false); setPosting(false);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      {(replyTo || quotedPost) && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          {replyTo ? <><MessageCircle size={11} /> Replying to <strong className="text-foreground">{replyTo.profile?.firstName}</strong></> : <><Quote size={11} /> Quoting <strong className="text-foreground">{quotedPost?.profile?.firstName}</strong></>}
        </p>
      )}
      <div className="flex gap-3">
        <Avatar p={{ firstName: profile.firstName, lastName: profile.lastName, position: profile.position }} size={9} />
        <textarea autoFocus value={content} onChange={e => setContent(e.target.value)} placeholder={placeholder} rows={3}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none" />
      </div>
      {showVideo && (
        <div className="space-y-2">
          <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Paste YouTube URL…"
            className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
          {videoId && <div className="aspect-video rounded-xl overflow-hidden bg-zinc-900"><iframe src={`https://www.youtube.com/embed/${videoId}`} title="preview" allowFullScreen className="w-full h-full" /></div>}
          {videoUrl && !videoId && <p className="text-xs text-destructive">Couldn&apos;t find a YouTube video ID in that link.</p>}
        </div>
      )}
      {quotedPost && <QuotedPost post={quotedPost} />}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <button onClick={() => setShowVideo(v => !v)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${showVideo ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}>
          <Video size={13} /> Video
        </button>
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

  useEffect(() => {
    apiFetch<{ posts: PostData[] }>("/posts", { posts: [] }).then(d => { setPosts(d.posts ?? []); setLoading(false); });
  }, []);

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
          <PostCard key={post.id} post={post} currentUserId={currentUserId}
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
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-lg font-black text-primary" style={{ fontFamily: "'Roboto Slab',serif" }}>{player.profile.firstName[0]}{player.profile.lastName[0]}</div>
                <div className="flex gap-1.5"><span className="bg-primary/20 text-primary text-xs font-semibold px-2 py-1 rounded-lg">{player.profile.position}</span><span className="bg-card text-muted-foreground text-xs px-2 py-1 rounded-lg">{player.profile.gradYear}</span></div>
              </div>
              <div className="mt-3"><h3 className="font-black text-base" style={{ fontFamily: "'Roboto Slab',serif" }}>{player.profile.firstName} {player.profile.lastName}</h3>{player.profile.height && <p className="text-xs text-muted-foreground mt-0.5">{player.profile.height}{player.profile.weight ? ` · ${player.profile.weight} lbs` : ""}</p>}</div>
            </div>
            <div className="px-5 py-4 grid grid-cols-3 gap-2 text-center">
              {[{ l: "Streak", v: `${player.summary.streak}d` }, { l: "Shooting", v: `${player.summary.shootingPct}%` }, { l: "Hours", v: `${Math.round(player.summary.totalMinutes / 60)}h` }].map(s => (
                <div key={s.l}><p className="text-lg font-black text-primary leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{s.v}</p><p className="text-xs text-muted-foreground mt-0.5">{s.l}</p></div>
              ))}
            </div>
            <div className="px-5 pb-4 flex items-center justify-between"><span className="text-xs text-muted-foreground">{player.summary.activeDays} sessions</span><ArrowRight size={14} className="text-muted-foreground group-hover:text-primary" /></div>
          </div>
        ))}</div>}
    </div>
  );
}

// ─── Community Page ───────────────────────────────────────────────────────────
function CommunityPage({ currentUserId, currentProfile, onBack }: { currentUserId?: string; currentProfile?: UserProfile | null; onBack?: () => void }) {
  const [tab, setTab] = useState<"feed" | "players">("feed");
  const [selected, setSelected] = useState<CommunityPlayer | null>(null);

  if (selected) return <PlayerProfileView player={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <header className="border-b border-border px-6 py-5 max-w-5xl mx-auto flex items-center gap-3">
        {onBack && <button onClick={onBack} className="text-muted-foreground hover:text-foreground"><ChevronLeft size={20} /></button>}
        <span className="text-2xl">🏀</span>
        <div><h1 className="text-xl font-black tracking-tight leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>COMMUNITY</h1><p className="text-xs text-muted-foreground uppercase tracking-widest">Players · Coaches · Scouts</p></div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit">
          {(["feed", "players"] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>)}
        </div>
        {tab === "feed" && <FeedTab currentUserId={currentUserId} currentProfile={currentProfile} />}
        {tab === "players" && <PlayersTab onSelect={setSelected} />}
      </main>
    </div>
  );
}

// ─── Player Profile View ──────────────────────────────────────────────────────
function PlayerProfileView({ player, onBack }: { player: CommunityPlayer; onBack?: () => void }) {
  const [gameData, setGameData] = useState<AppData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch<{ data: AppData | null }>(`/gamedata/${player.userId}`, { data: null }).then(d => { if (d.data) setGameData(d.data); });
  }, [player.userId]);

  function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("player", player.userId); url.searchParams.delete("view");
    navigator.clipboard.writeText(url.toString()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
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
        <button onClick={copyLink} className="flex items-center gap-2 text-xs bg-card border border-border rounded-xl px-3 py-2 hover:border-primary hover:text-primary transition-all">
          {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied!" : "Share"}
        </button>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent px-6 py-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-2xl font-black text-primary flex-shrink-0" style={{ fontFamily: "'Roboto Slab',serif" }}>{p.firstName[0]}{p.lastName[0]}</div>
            <div className="flex-1">
              <h2 className="text-2xl font-black leading-none" style={{ fontFamily: "'Roboto Slab',serif" }}>{p.firstName} {p.lastName}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                {p.position && <span className="bg-primary/20 text-primary text-xs font-semibold px-2.5 py-1 rounded-lg">{p.position}</span>}
                {p.gradYear && <span className="bg-secondary text-muted-foreground text-xs px-2.5 py-1 rounded-lg">Class of {p.gradYear}</span>}
              </div>
              {p.bio && <p className="text-sm text-muted-foreground mt-2">{p.bio}</p>}
            </div>
          </div>
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
              <Tooltip content={<ChartTip unit=" min" />} cursor={{ fill: "rgba(249,115,22,0.07)" }} />
              <Bar name="pub-min" dataKey="minutes" fill="#f97316" radius={[6, 6, 0, 0]} />
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
              <ReferenceLine y={pct} stroke="rgba(249,115,22,0.3)" strokeDasharray="4 4" />
              <Tooltip content={<ChartTip unit="%" />} cursor={{ stroke: "rgba(249,115,22,0.2)", strokeWidth: 1 }} />
              <Line name="pub-pct" type="monotone" dataKey="pct" stroke="#f97316" strokeWidth={2.5} dot={{ fill: "#f97316", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: "#f97316" }} />
            </LineChart></ResponsiveContainer></div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [mode, setMode] = useState<"options" | "email" | "sent">("options");
  const [email, setEmail] = useState(""), [loadingG, setLoadingG] = useState(false), [loadingE, setLoadingE] = useState(false), [error, setError] = useState("");

  async function handleGoogle() {
    setLoadingG(true); setError("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } });
    if (error) { setError("Google sign-in isn't set up yet. Please use Continue with Email instead — it works right now!"); setLoadingG(false); }
  }
  async function handleEmail(e: React.FormEvent) {
    e.preventDefault(); if (!email.trim()) return;
    setLoadingE(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.href } });
    if (error) { setError(error.message); setLoadingE(false); } else setMode("sent");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative" style={{ fontFamily: "'DM Sans',sans-serif" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <img src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1400&h=900&fit=crop&auto=format" alt="" className="w-full h-full object-cover opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      </div>
      <div className="relative w-full max-w-sm flex flex-col gap-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="text-6xl">🏀</span>
          <div><h1 className="text-4xl font-black tracking-tight" style={{ fontFamily: "'Roboto Slab',serif" }}>{APP_NAME}</h1><p className="text-muted-foreground mt-2">{APP_TAGLINE}</p></div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
          {mode === "sent" ? (
            <div className="text-center py-4 flex flex-col gap-3">
              <div className="text-4xl">📬</div>
              <h2 className="font-bold text-lg">Check your email</h2>
              <p className="text-sm text-muted-foreground">We sent a magic link to <strong className="text-foreground">{email}</strong>. Click it to sign in — no password needed.</p>
              <button onClick={() => setMode("options")} className="text-xs text-muted-foreground hover:text-primary mt-2">Use a different email</button>
            </div>
          ) : mode === "email" ? (
            <form onSubmit={handleEmail} className="flex flex-col gap-3">
              <div><label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Your email</label>
                <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary" /></div>
              {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">{error}</p>}
              <button type="submit" disabled={loadingE} className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-accent disabled:opacity-50 text-sm">{loadingE ? "Sending…" : "Send Magic Link"}</button>
              <button type="button" onClick={() => { setMode("options"); setError(""); }} className="text-xs text-muted-foreground hover:text-foreground text-center">← Back</button>
            </form>
          ) : (
            <>
              <button onClick={handleGoogle} disabled={loadingG} className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold py-3 px-4 rounded-xl hover:bg-gray-50 disabled:opacity-50 text-sm">
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                {loadingG ? "Redirecting…" : "Continue with Google"}
              </button>
              <div className="flex items-center gap-3"><div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground">or</span><div className="flex-1 h-px bg-border" /></div>
              <button onClick={() => { setMode("email"); setError(""); }} className="w-full flex items-center justify-center gap-2 bg-secondary text-foreground font-semibold py-3 px-4 rounded-xl hover:bg-muted text-sm border border-border">✉️ Continue with Email</button>
              {error && <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg p-3">{error}</p>}
              <p className="text-xs text-center text-muted-foreground">Your stats are private by default.</p>
            </>
          )}
        </div>
        <button onClick={() => { const u = new URL(window.location.href); u.searchParams.set("view", "community"); window.location.href = u.toString(); }}
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <Globe size={14} /> View Community Board (coaches &amp; scouts)
        </button>
      </div>
    </div>
  );
}

// ─── Profile Setup ────────────────────────────────────────────────────────────
function ProfileSetup({ userId, email, onComplete }: { userId: string; email: string; onComplete: (p: UserProfile) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", position: "PG", gradYear: String(new Date().getFullYear() + 1), height: "", weight: "", wingspan: "", vertical: "", bio: "", isPublic: true });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const cls = "bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary w-full";
  const lbl = "text-xs text-muted-foreground uppercase tracking-wider mb-1 block";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    const profile: UserProfile = { userId, email, ...form };
    saveLocalProfile(profile);
    bgPost(userId, profile);
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
function TrainingView({ data }: { data: AppData }) {
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
  const heatBg = ["#1e1e20","rgba(249,115,22,0.2)","rgba(249,115,22,0.4)","rgba(249,115,22,0.7)","#f97316"];
  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5"><Clock size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Weekly Volume (last 8 weeks)</span></div>
        <div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart id="t-weekly" data={weeklyData} barSize={28} margin={{ top:4,right:4,bottom:0,left:-20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="week" tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} unit=" m" />
          <Tooltip content={<ChartTip unit=" min" />} cursor={{ fill:"rgba(249,115,22,0.07)" }} />
          <Bar name="weekly-min" dataKey="minutes" fill="#f97316" radius={[6,6,0,0]} />
        </BarChart></ResponsiveContainer></div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5"><Target size={14} className="text-primary" /><span className="text-xs uppercase tracking-wider text-muted-foreground">Monthly Shooting % (last 6 months)</span></div>
        <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart id="t-monthly" data={monthlyShots} margin={{ top:4,right:4,bottom:0,left:-20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="month" tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0,100]} tick={{ fill:"#8a8680",fontSize:11 }} axisLine={false} tickLine={false} unit="%" />
          <ReferenceLine y={avgPct} stroke="rgba(249,115,22,0.3)" strokeDasharray="4 4" />
          <Tooltip content={<ChartTip unit="%" />} cursor={{ stroke:"rgba(249,115,22,0.2)",strokeWidth:1 }} />
          <Line name="monthly-pct" type="monotone" dataKey="pct" stroke="#f97316" strokeWidth={2.5} connectNulls dot={{ fill:"#f97316",r:4,strokeWidth:0 }} activeDot={{ r:6,fill:"#f97316" }} />
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
function StrengthView({ data, onUpdate }: { data: AppData; onUpdate: (d: AppData) => void }) {
  const [sel, setSel] = useState(0), [adding, setAdding] = useState(false), [wt, setWt] = useState(""), [rp, setRp] = useState(""), [addEx, setAddEx] = useState(false), [exName, setExName] = useState("");
  const ex = data.strength[Math.min(sel, data.strength.length-1)];
  const saveEntry = () => { const w=parseFloat(wt),r=parseInt(rp); if(!w||!r)return; onUpdate({...data,strength:data.strength.map((e,i)=>i===sel?{...e,history:[...e.history,{date:new Date().toISOString().slice(0,10),weight:w,reps:r}]}:e)}); setWt(""); setRp(""); setAdding(false); };
  const saveEx = () => { if(!exName.trim())return; const nd={...data,strength:[...data.strength,{name:exName.trim(),unit:"lbs" as const,history:[]}]}; onUpdate(nd); setSel(nd.strength.length-1); setExName(""); setAddEx(false); };
  const graphData = ex.history.map(h=>({date:shortDate(h.date),weight:h.weight}));
  const best = ex.history.length?Math.max(...ex.history.map(h=>h.weight)):0;
  const last = ex.history.length?ex.history[ex.history.length-1].weight:null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {data.strength.map((e,i)=><button key={i} onClick={()=>{setSel(i);setAdding(false);}} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${i===sel?"bg-primary text-primary-foreground":"bg-secondary text-secondary-foreground hover:bg-muted"}`}>{e.name}</button>)}
        {addEx?(<div className="flex items-center gap-2"><input autoFocus value={exName} onChange={e=>setExName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEx()} placeholder="Exercise name" className="bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none w-36" /><button onClick={saveEx} className="bg-primary text-primary-foreground rounded-xl p-2"><Check size={14}/></button><button onClick={()=>{setAddEx(false);setExName("");}} className="bg-secondary rounded-xl p-2"><X size={14}/></button></div>)
        :<button onClick={()=>setAddEx(true)} className="px-4 py-2 rounded-xl text-sm bg-secondary text-muted-foreground hover:text-foreground flex items-center gap-1.5"><Plus size={13}/> Add lift</button>}
      </div>
      <div className="grid grid-cols-3 gap-4">{[{l:"Best",v:best?`${best} ${ex.unit}`:"—"},{l:"Last",v:last!==null?`${last} ${ex.unit}`:"—"},{l:"Sessions",v:String(ex.history.length)}].map(s=>(<div key={s.l} className="bg-card border border-border rounded-2xl p-4"><p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{s.l}</p><p className="text-2xl font-black text-primary" style={{fontFamily:"'Roboto Slab',serif"}}>{s.v}</p></div>))}</div>
      {graphData.length>=2?(<div className="bg-card border border-border rounded-2xl p-6"><div className="flex items-center gap-2 mb-5"><TrendingUp size={14} className="text-primary"/><span className="text-xs uppercase tracking-wider text-muted-foreground">{ex.name} — Weight Over Time</span></div><div className="h-48"><ResponsiveContainer width="100%" height="100%"><LineChart id="s-strength" data={graphData} margin={{top:4,right:4,bottom:0,left:-10}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/><XAxis dataKey="date" tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false} unit={` ${ex.unit}`}/><Tooltip content={<ChartTip unit={` ${ex.unit}`}/>} cursor={{stroke:"rgba(249,115,22,0.2)",strokeWidth:1}}/><Line name="strength-weight" type="monotone" dataKey="weight" stroke="#f97316" strokeWidth={2.5} dot={{fill:"#f97316",r:4,strokeWidth:0}} activeDot={{r:6,fill:"#f97316"}}/></LineChart></ResponsiveContainer></div></div>)
      :<div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground text-sm">Log at least 2 sessions to see your chart.</div>}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4"><span className="text-xs uppercase tracking-wider text-muted-foreground">History</span>{!adding&&<button onClick={()=>setAdding(true)} className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-accent"><Plus size={12}/> Log today</button>}</div>
        {adding&&(<div className="flex items-end gap-3 mb-4 p-3 bg-secondary rounded-xl"><div className="flex-1"><label className="text-xs text-muted-foreground block mb-1">Weight ({ex.unit})</label><input autoFocus value={wt} onChange={e=>setWt(e.target.value)} type="number" placeholder="135" className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm outline-none"/></div><div className="flex-1"><label className="text-xs text-muted-foreground block mb-1">Reps</label><input value={rp} onChange={e=>setRp(e.target.value)} type="number" placeholder="5" className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm outline-none"/></div><div className="flex gap-2"><button onClick={saveEntry} className="bg-primary text-primary-foreground rounded-lg p-2 hover:bg-accent"><Check size={15}/></button><button onClick={()=>setAdding(false)} className="bg-muted rounded-lg p-2"><X size={15}/></button></div></div>)}
        {ex.history.length===0?<p className="text-muted-foreground text-sm text-center py-4">No entries yet.</p>:(<div>{[...ex.history].reverse().map((h,i)=>(<div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0"><span className="text-sm text-muted-foreground">{shortDate(h.date)}</span><div className="flex gap-4"><span className="text-sm">{h.reps} reps</span><span className="text-sm font-semibold text-primary">{h.weight} {ex.unit}</span></div></div>))}</div>)}
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
  const [shotMade, setShotMade] = useState(0), [shotAtt, setShotAtt] = useState(0), [shotMode, setShotMode] = useState(false);
  const [streakPulse, setStreakPulse] = useState(false);
  const [sharedPlayer, setSharedPlayer] = useState<CommunityPlayer | null>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const playerIdParam = urlParams.get("player");
  const viewParam = urlParams.get("view");

  useEffect(() => {
    if (playerIdParam) {
      apiFetch<{ profile: UserProfile | null }>(`/profile/${playerIdParam}`, { profile: null })
        .then(d => { if (d.profile) setSharedPlayer({ userId: playerIdParam, profile: d.profile, summary: { streak:0,shootingPct:0,totalMinutes:0,activeDays:0 } }); });
    }
  }, [playerIdParam]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setAuthState("unauthenticated"); return; }
      const uid = session.user.id;
      setUserId(uid); setUserEmail(session.user.email || "");
      const lp = localProfile(uid);
      if (lp) { setProfile(lp); setData(localData(uid) || emptyData()); setAuthState("ready"); }
      else setAuthState("needs_profile");
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (timerOn) timerRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerOn]);

  const updateData = useCallback((nd: AppData) => {
    setData(nd);
    if (userId) { saveLocalData(userId, nd); bgData(userId, nd); }
  }, [userId]);

  function handleProfileComplete(p: UserProfile) { setProfile(p); setData(emptyData()); setAuthState("ready"); }
  async function handleLogout() { await supabase.auth.signOut(); setUserId(null); setProfile(null); setData(emptyData()); setAuthState("unauthenticated"); }
  function copyShareLink() {
    if (!userId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("player", userId); url.searchParams.delete("view");
    navigator.clipboard.writeText(url.toString()).catch(() => {});
  }
  function saveSession() {
    if (timerSec < 60) return;
    const min = Math.floor(timerSec / 60), today = new Date().toISOString().slice(0,10);
    const nd = { ...data };
    const idx = nd.sessions.findIndex(s => s.date === today);
    if (idx >= 0) nd.sessions[idx].minutes += min; else nd.sessions = [...nd.sessions, { date: today, minutes: min }];
    const yest = makeDate(1);
    if (nd.lastPracticeDate !== today) { nd.streak = nd.lastPracticeDate === yest ? nd.streak + 1 : 1; setStreakPulse(true); setTimeout(() => setStreakPulse(false), 800); }
    nd.lastPracticeDate = today; updateData(nd); setTimerOn(false); setTimerSec(0);
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
  const graphData = data.sessions.slice(-7).map(s=>({date:shortDate(s.date),minutes:s.minutes}));
  const todayMin = (()=>{ const t=new Date().toISOString().slice(0,10); return data.sessions.find(s=>s.date===t)?.minutes||0; })();
  const viewLabels: Record<View,string> = { home:"Home",training:"Training",strength:"Strength",community:"Community" };
  const navCards = [
    { key:"strength" as View, label:"Strength", sub:"Track your lifts", img:"1534438327776-3db31fd82e9a", Icon:Dumbbell },
    { key:"training" as View, label:"Training", sub:"Long-term graphs", img:"1504450758481-c3d163b34b90", Icon:TrendingUp },
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
          <button onClick={copyShareLink} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"><ExternalLink size={13}/> Share</button>
          <button onClick={()=>setView("community")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"><Users size={13}/> Community</button>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><LogOut size={13}/> Sign Out</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {view==="training" && <TrainingView data={data}/>}
        {view==="strength" && <StrengthView data={data} onUpdate={updateData}/>}
        {view==="community" && <CommunityPage currentUserId={userId??undefined} currentProfile={profile} onBack={()=>setView("home")}/>}

        {view==="home" && <>
          <div className="relative rounded-2xl overflow-hidden h-48 bg-zinc-900">
            <img src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200&h=400&fit=crop&auto=format" alt="Court" className="w-full h-full object-cover opacity-60"/>
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent flex items-end p-6">
              <div><p className="text-xs uppercase tracking-widest text-primary font-medium mb-1">{APP_NAME}</p><h2 className="text-3xl font-black text-white leading-none" style={{fontFamily:"'Roboto Slab',serif"}}>Keep grinding, {profile.firstName}.</h2></div>
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <span className="bg-black/50 rounded-lg px-2 py-1 text-xs text-primary font-medium">{profile.position}</span>
              <span className="bg-black/50 rounded-lg px-2 py-1 text-xs text-muted-foreground">Class of {profile.gradYear}</span>
            </div>
          </div>

          {(profile.height||profile.weight||profile.wingspan||profile.vertical)&&(
            <div className="bg-card border border-border rounded-2xl px-6 py-4 grid grid-cols-4 gap-4 text-center">
              {[{l:"Height",v:profile.height},{l:"Weight",v:profile.weight?`${profile.weight} lbs`:""},{l:"Wingspan",v:profile.wingspan},{l:"Vertical",v:profile.vertical?`${profile.vertical}"`:""}].filter(m=>m.v).map(m=>(
                <div key={m.l}><p className="text-xl font-black leading-none" style={{fontFamily:"'Roboto Slab',serif"}}>{m.v}</p><p className="text-xs text-muted-foreground mt-1">{m.l}</p></div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {[
              {Icon:Flame, label:"Practice Streak",big:String(data.streak),unit:"days",sub:data.streak>=7?"Week+ streak! 🔥":`${7-data.streak} days to a week`,pulse:streakPulse},
              {Icon:Target,label:"Shooting %",big:String(pct),unit:"%",sub:`${totalMade} / ${totalAtt} all-time`,pulse:false},
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
                  <button onClick={()=>setTimerOn(v=>!v)} className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 py-2.5 rounded-xl hover:bg-accent text-sm">{timerOn?<Pause size={16}/>:<Play size={16}/>}{timerOn?"Pause":"Start"}</button>
                  <button onClick={()=>{setTimerOn(false);setTimerSec(0);}} className="flex items-center gap-2 bg-secondary text-secondary-foreground font-semibold px-4 py-2.5 rounded-xl hover:bg-muted text-sm"><RotateCcw size={16}/></button>
                </div>
                <button onClick={saveSession} disabled={timerSec<60} className="w-full flex items-center justify-center gap-2 border border-primary text-primary font-semibold py-2.5 rounded-xl hover:bg-primary/10 text-sm disabled:opacity-30 disabled:cursor-not-allowed"><Check size={15}/> Save Session ({Math.floor(timerSec/60)} min)</button>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Target size={13} className="text-primary"/> Log Shots</div>
              {!shotMode?(
                <div className="flex flex-col gap-4">
                  <div className="space-y-2">{data.shots.slice(-3).reverse().map((s,i)=>(<div key={i} className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Session {data.shots.length-i}</span><div className="flex items-center gap-2"><div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{width:`${Math.round((s.made/s.attempted)*100)}%`}}/></div><span className="font-medium w-10 text-right">{Math.round((s.made/s.attempted)*100)}%</span></div></div>))}</div>
                  <button onClick={()=>setShotMode(true)} className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-2.5 rounded-xl hover:bg-accent text-sm"><Plus size={15}/> Log New Session</button>
                </div>
              ):(
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[{lbl:"Made",val:shotMade,set:setShotMade},{lbl:"Attempted",val:shotAtt,set:setShotAtt}].map(({lbl,val,set})=>(
                      <div key={lbl} className="flex flex-col gap-1.5"><label className="text-xs text-muted-foreground uppercase tracking-wide">{lbl}</label><div className="flex items-center gap-2"><button onClick={()=>set(v=>Math.max(0,v-1))} className="bg-secondary rounded-lg p-1.5 hover:bg-muted"><Minus size={14}/></button><span className="text-2xl font-black text-primary w-8 text-center" style={{fontFamily:"'Roboto Slab',serif"}}>{val}</span><button onClick={()=>set(v=>v+1)} className="bg-secondary rounded-lg p-1.5 hover:bg-muted"><Plus size={14}/></button></div></div>
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

          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-2"><TrendingUp size={14} className="text-primary"/><span className="text-xs uppercase tracking-wider text-muted-foreground">Daily Practice Duration</span></div><span className="text-xs text-muted-foreground">Last 7 days</span></div>
            <div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart id="h-duration" data={graphData} barSize={28} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
              <XAxis dataKey="date" tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false} unit=" m"/>
              <Tooltip content={<ChartTip unit=" min"/>} cursor={{fill:"rgba(249,115,22,0.07)"}}/>
              <Bar name="home-minutes" dataKey="minutes" fill="#f97316" radius={[6,6,0,0]}/>
            </BarChart></ResponsiveContainer></div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5"><div className="flex items-center gap-2"><Target size={14} className="text-primary"/><span className="text-xs uppercase tracking-wider text-muted-foreground">Shooting % Over Time</span></div><span className="text-xs text-muted-foreground">Per session</span></div>
            <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart id="h-shooting" data={data.shots.map((s,i)=>({session:`S${i+1}`,pct:s.attempted>0?Math.round((s.made/s.attempted)*100):0}))} margin={{top:4,right:4,bottom:0,left:-20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
              <XAxis dataKey="session" tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis domain={[0,100]} tick={{fill:"#8a8680",fontSize:11}} axisLine={false} tickLine={false} unit="%"/>
              <ReferenceLine y={pct} stroke="rgba(249,115,22,0.3)" strokeDasharray="4 4"/>
              <Tooltip content={<ChartTip unit="%"/>} cursor={{stroke:"rgba(249,115,22,0.2)",strokeWidth:1}}/>
              <Line name="home-pct" type="monotone" dataKey="pct" stroke="#f97316" strokeWidth={2.5} dot={{fill:"#f97316",r:4,strokeWidth:0}} activeDot={{r:6,fill:"#f97316"}}/>
            </LineChart></ResponsiveContainer></div>
            <p className="text-xs text-muted-foreground mt-3">Dashed line = all-time average ({pct}%)</p>
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
          <p className="text-center text-xs text-muted-foreground pb-4">Keep grinding, {profile.firstName}! 🏀</p>
        </>}
      </main>
    </div>
  );
}
