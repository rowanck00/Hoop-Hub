import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js";
import * as kv from "./kv_store.tsx";

const app = new Hono();
const ADMIN_EMAILS = ["kingof21kings@gmail.com"];
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
);
app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.get("/make-server-4cb0fb87/health", (c) => c.json({ status: "ok" }));

async function getAuthedUser(c: any) {
  const auth = c.req.header("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
async function requireUser(c: any, userId?: string) {
  const user = await getAuthedUser(c);
  if (!user) return { error: c.json({ error: "Sign in required" }, 401) };
  if (userId && user.id !== userId) return { error: c.json({ error: "Not allowed" }, 403) };
  return { user };
}
function isAdminEmail(email?: string | null) {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

function ytId(url: string): string | null {
  const m = url?.match(/(?:youtu\.be\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function miniProfile(p: any) {
  if (!p) return { userId: "", firstName: "Player", lastName: "", position: "", avatarUrl: "", role: "player", accountType: "player", teamName: "" };
  return { userId: p.userId, firstName: p.firstName, lastName: p.lastName, position: p.position, avatarUrl: p.avatarUrl || "", role: isAdminEmail(p.email) ? "admin" : "player", accountType: p.accountType || "player", teamName: p.teamName || "" };
}
function safeProfile(p: any) {
  return p ? { ...p, role: isAdminEmail(p.email) ? "admin" : "player" } : null;
}
function cleanText(value: unknown, max = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function cleanImageUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString().slice(0, 500) : "";
  } catch {
    return "";
  }
}
const BANNED_WORDS = ["fuck", "shit", "bitch", "asshole", "nigger", "faggot"];
function hasBannedWords(value: unknown) {
  const text = String(value || "").toLowerCase();
  return BANNED_WORDS.some(w => new RegExp(`\\b${w}\\b`, "i").test(text));
}
async function getBlocked(userId?: string) {
  return userId ? ((await kv.get(`blocked_${userId}`)) || []) : [];
}

// Relevance score: recency + engagement
function scorePost(post: any): number {
  const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / 3600000;
  const recency = Math.max(0, 100 - ageHours * 2); // decay over ~50 hours
  const engagement = (post.likeCount || 0) * 2 + (post.repostCount || 0) * 3 + (post.replyCount || 0) * 1.5;
  return recency + engagement;
}

// Push notification
async function pushNotif(toUserId: string, notif: object) {
  if (!toUserId) return;
  const key = `notifs_${toUserId}`;
  const existing: any[] = (await kv.get(key)) || [];
  const trimmed = [{ ...notif, id: crypto.randomUUID(), createdAt: new Date().toISOString(), read: false }, ...existing].slice(0, 50);
  await kv.set(key, trimmed);
}

// ── Profile ───────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/profile", async (c) => {
  const body = await c.req.json();
  const { userId, ...profile } = body;
  if (!userId) return c.json({ error: "userId required" }, 400);
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const safeProfile = {
    ...profile,
    firstName: cleanText(profile.firstName),
    lastName: cleanText(profile.lastName),
    avatarUrl: cleanImageUrl(profile.avatarUrl),
    role: isAdminEmail(auth.user.email) ? "admin" : "player",
  };
  if (!safeProfile.firstName || !safeProfile.lastName) return c.json({ error: "name required" }, 400);
  await kv.set(`profile_${userId}`, { userId, ...safeProfile, updatedAt: new Date().toISOString() });
  const index: string[] = (await kv.get("user_index")) || [];
  if (!index.includes(userId)) await kv.set("user_index", [...index, userId]);
  return c.json({ ok: true });
});

app.get("/make-server-4cb0fb87/profile/:userId", async (c) => {
  const userId = c.req.param("userId");
  const profile = await kv.get(`profile_${userId}`);
  return c.json({ profile: safeProfile(profile) });
});

// ── User search ───────────────────────────────────────────────────────────────
app.get("/make-server-4cb0fb87/users/search", async (c) => {
  const q = (c.req.query("q") || "").toLowerCase().trim();
  if (!q) return c.json({ users: [] });
  const index: string[] = (await kv.get("user_index")) || [];
  const all = await Promise.all(index.map(id => kv.get(`profile_${id}`)));
  const matched = all.filter((p: any) =>
    p && (`${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (p.teamName || "").toLowerCase().includes(q))
  ).slice(0, 10).map((p: any) => miniProfile(p));
  return c.json({ users: matched });
});

// ── Game data ─────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/gamedata", async (c) => {
  const { userId, data } = await c.req.json();
  if (!userId) return c.json({ error: "userId required" }, 400);
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  await kv.set(`gamedata_${userId}`, data);
  return c.json({ ok: true });
});

app.get("/make-server-4cb0fb87/gamedata/:userId", async (c) => {
  const userId = c.req.param("userId");
  const data = await kv.get(`gamedata_${userId}`);
  return c.json({ data: data || null });
});

// ── Community players ─────────────────────────────────────────────────────────
app.get("/make-server-4cb0fb87/community", async (c) => {
  const index: string[] = (await kv.get("user_index")) || [];
  const players = await Promise.all(index.map(async (userId: string) => {
    const profile = await kv.get(`profile_${userId}`);
    const gamedata = await kv.get(`gamedata_${userId}`);
    if (!profile) return null;
    const shots = gamedata?.shots || [];
    const sessions = gamedata?.sessions || [];
    const made = shots.reduce((a: number, b: any) => a + b.made, 0);
    const att  = shots.reduce((a: number, b: any) => a + b.attempted, 0);
    return {
      userId, profile,
      summary: {
        streak: gamedata?.streak || 0,
        shootingPct: att > 0 ? Math.round((made / att) * 100) : 0,
        totalMinutes: sessions.reduce((a: number, b: any) => a + b.minutes, 0),
        activeDays: sessions.filter((s: any) => s.minutes > 0).length,
        shotsMade: made, shotsAttempted: att,
      },
    };
  }));
  return c.json({ players: players.filter(Boolean) });
});

// ── Follow system ─────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/follow", async (c) => {
  const { followerId, followeeId, followerName } = await c.req.json();
  if (!followerId || !followeeId || followerId === followeeId) return c.json({ error: "Invalid" }, 400);
  const auth = await requireUser(c, followerId);
  if (auth.error) return auth.error;
  const following: string[] = (await kv.get(`following_${followerId}`)) || [];
  if (!following.includes(followeeId)) {
    await kv.set(`following_${followerId}`, [...following, followeeId]);
    const followers: string[] = (await kv.get(`followers_${followeeId}`)) || [];
    await kv.set(`followers_${followeeId}`, [...followers, followerId]);
    await pushNotif(followeeId, { type: "follow", fromUserId: followerId, fromName: followerName, message: `${followerName} started following you` });
  }
  return c.json({ ok: true, following: true });
});

app.post("/make-server-4cb0fb87/unfollow", async (c) => {
  const { followerId, followeeId } = await c.req.json();
  if (!followerId || !followeeId) return c.json({ error: "Invalid" }, 400);
  const auth = await requireUser(c, followerId);
  if (auth.error) return auth.error;
  const following: string[] = (await kv.get(`following_${followerId}`)) || [];
  await kv.set(`following_${followerId}`, following.filter((id: string) => id !== followeeId));
  const followers: string[] = (await kv.get(`followers_${followeeId}`)) || [];
  await kv.set(`followers_${followeeId}`, followers.filter((id: string) => id !== followerId));
  return c.json({ ok: true, following: false });
});

app.get("/make-server-4cb0fb87/social/:userId", async (c) => {
  const userId = c.req.param("userId");
  const following: string[] = (await kv.get(`following_${userId}`)) || [];
  const followers: string[] = (await kv.get(`followers_${userId}`)) || [];
  return c.json({ following, followers, followingCount: following.length, followersCount: followers.length });
});

// ── Notifications ─────────────────────────────────────────────────────────────
app.get("/make-server-4cb0fb87/notifications/:userId", async (c) => {
  const userId = c.req.param("userId");
  const notifs = (await kv.get(`notifs_${userId}`)) || [];
  return c.json({ notifications: notifs });
});

app.post("/make-server-4cb0fb87/notifications/:userId/read", async (c) => {
  const userId = c.req.param("userId");
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const notifs: any[] = (await kv.get(`notifs_${userId}`)) || [];
  await kv.set(`notifs_${userId}`, notifs.map(n => ({ ...n, read: true })));
  return c.json({ ok: true });
});

app.delete("/make-server-4cb0fb87/notifications/:userId", async (c) => {
  const userId = c.req.param("userId");
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  await kv.set(`notifs_${userId}`, []);
  return c.json({ ok: true });
});

// ── Posts ─────────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/posts", async (c) => {
  const { userId, content, videoUrl, replyTo, quotedPostId, taggedUserIds, coAuthors } = await c.req.json();
  if (!userId || (!content?.trim() && !videoUrl)) return c.json({ error: "Content required" }, 400);
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  if (hasBannedWords(content)) return c.json({ error: "Post contains blocked language" }, 400);

  const id = crypto.randomUUID();
  const post = {
    id, userId,
    content: content?.trim() || "",
    videoUrl: videoUrl || null,
    videoId: videoUrl ? ytId(videoUrl) : null,
    replyTo: replyTo || null,
    quotedPostId: quotedPostId || null,
    taggedUserIds: taggedUserIds || [],
    coAuthors: coAuthors || [],
    createdAt: new Date().toISOString(),
    likes: [], reposts: [],
    likeCount: 0, repostCount: 0, replyCount: 0,
    reports: [], reportCount: 0, removed: false,
  };
  await kv.set(`post_${id}`, post);

  const profile = await kv.get(`profile_${userId}`);
  const pName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : "Someone";

  if (replyTo) {
    const parent = await kv.get(`post_${replyTo}`);
    if (parent) {
      parent.replyCount = (parent.replyCount || 0) + 1;
      await kv.set(`post_${replyTo}`, parent);
      if (parent.userId !== userId) {
        await pushNotif(parent.userId, { type: "reply", fromUserId: userId, fromName: pName, postId: id, message: `${pName} replied to your post` });
      }
    }
  }

  // Notify tagged users
  for (const tid of (taggedUserIds || [])) {
    if (tid !== userId) await pushNotif(tid, { type: "tag", fromUserId: userId, fromName: pName, postId: id, message: `${pName} tagged you in a post` });
  }

  return c.json({ post: { ...post, profile: profile ? miniProfile(profile) : null } });
});

app.get("/make-server-4cb0fb87/posts", async (c) => {
  const viewerId = c.req.query("viewerId") || "";
  const blocked = await getBlocked(viewerId);
  const allPosts = await kv.getByPrefix("post_");
  const topLevel = allPosts
    .filter((p: any) => p && !p.replyTo && !p.removed && (p.reportCount || 0) < 3 && !blocked.includes(p.userId))
    .sort((a: any, b: any) => scorePost(b) - scorePost(a)) // relevance sort
    .slice(0, 60);

  const enriched = await Promise.all(topLevel.map(async (post: any) => {
    const profile = await kv.get(`profile_${post.userId}`);
    let quotedPost = null;
    if (post.quotedPostId) {
      const qp = await kv.get(`post_${post.quotedPostId}`);
      if (qp) {
        const qProfile = await kv.get(`profile_${qp.userId}`);
        quotedPost = { ...qp, profile: qProfile ? miniProfile(qProfile) : null };
      }
    }
    // Enrich tagged profiles
    const taggedProfiles = [];
    for (const tid of (post.taggedUserIds || [])) {
      const tp = await kv.get(`profile_${tid}`);
      if (tp) taggedProfiles.push({ userId: tid, ...miniProfile(tp) });
    }
    return { ...post, profile: profile ? miniProfile(profile) : { firstName: "Player", lastName: "", position: "" }, quotedPost, taggedProfiles };
  }));

  return c.json({ posts: enriched });
});

app.get("/make-server-4cb0fb87/posts/:postId/replies", async (c) => {
  const postId = c.req.param("postId");
  const viewerId = c.req.query("viewerId") || "";
  const blocked = await getBlocked(viewerId);
  const allPosts = await kv.getByPrefix("post_");
  const replies = allPosts
    .filter((p: any) => p && p.replyTo === postId && !p.removed && (p.reportCount || 0) < 3 && !blocked.includes(p.userId))
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const enriched = await Promise.all(replies.map(async (post: any) => {
    const profile = await kv.get(`profile_${post.userId}`);
    return { ...post, profile: profile ? miniProfile(profile) : null };
  }));
  return c.json({ replies: enriched });
});

app.post("/make-server-4cb0fb87/posts/:postId/like", async (c) => {
  const postId = c.req.param("postId");
  const { userId, userName } = await c.req.json();
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const post = await kv.get(`post_${postId}`);
  if (!post) return c.json({ error: "Not found" }, 404);
  const liked = (post.likes || []).includes(userId);
  post.likes = liked ? (post.likes || []).filter((id: string) => id !== userId) : [...(post.likes || []), userId];
  post.likeCount = post.likes.length;
  await kv.set(`post_${postId}`, post);
  if (!liked && post.userId !== userId) {
    await pushNotif(post.userId, { type: "like", fromUserId: userId, fromName: userName, postId, message: `${userName} liked your post` });
  }
  return c.json({ liked: !liked, likeCount: post.likeCount });
});

app.post("/make-server-4cb0fb87/posts/:postId/repost", async (c) => {
  const postId = c.req.param("postId");
  const { userId, userName } = await c.req.json();
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const post = await kv.get(`post_${postId}`);
  if (!post) return c.json({ error: "Not found" }, 404);
  const reposted = (post.reposts || []).includes(userId);
  post.reposts = reposted ? (post.reposts || []).filter((id: string) => id !== userId) : [...(post.reposts || []), userId];
  post.repostCount = post.reposts.length;
  await kv.set(`post_${postId}`, post);
  if (!reposted && post.userId !== userId) {
    await pushNotif(post.userId, { type: "repost", fromUserId: userId, fromName: userName, postId, message: `${userName} reposted your post` });
  }
  return c.json({ reposted: !reposted, repostCount: post.repostCount });
});

app.delete("/make-server-4cb0fb87/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  const auth = await requireUser(c);
  if (auth.error) return auth.error;
  const post = await kv.get(`post_${postId}`);
  if (!post) return c.json({ error: "Not found" }, 404);
  if (post.userId !== auth.user.id && !isAdminEmail(auth.user.email)) return c.json({ error: "Admin required" }, 403);
  post.removed = true;
  await kv.set(`post_${postId}`, post);
  return c.json({ ok: true });
});

app.post("/make-server-4cb0fb87/posts/:postId/report", async (c) => {
  const postId = c.req.param("postId");
  const { userId, reason } = await c.req.json();
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const post = await kv.get(`post_${postId}`);
  if (!post) return c.json({ error: "Not found" }, 404);
  post.reports = Array.from(new Set([...(post.reports || []), userId]));
  post.reportCount = post.reports.length;
  await kv.set(`post_${postId}`, post);
  const index: string[] = (await kv.get("user_index")) || [];
  const profiles = await Promise.all(index.map(id => kv.get(`profile_${id}`)));
  const admins = profiles.filter((p: any) => isAdminEmail(p?.email));
  await Promise.all(admins.map((admin: any) => pushNotif(admin.userId, {
    type: "report",
    fromUserId: userId,
    fromName: "Community Report",
    postId,
    message: `Post reported${reason ? `: ${cleanText(reason, 120)}` : ""}`,
  })));
  return c.json({ ok: true, hidden: false, reportCount: post.reportCount });
});

app.post("/make-server-4cb0fb87/block", async (c) => {
  const { userId, blockedUserId } = await c.req.json();
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  if (!blockedUserId || userId === blockedUserId) return c.json({ error: "Invalid" }, 400);
  const blocked = await getBlocked(userId);
  if (!blocked.includes(blockedUserId)) await kv.set(`blocked_${userId}`, [...blocked, blockedUserId]);
  return c.json({ ok: true });
});

app.post("/make-server-4cb0fb87/messages/notify", async (c) => {
  const { fromUserId, toUserId, fromName, message } = await c.req.json();
  const auth = await requireUser(c, fromUserId);
  if (auth.error) return auth.error;
  if (!toUserId || !message) return c.json({ error: "Missing fields" }, 400);
  await pushNotif(toUserId, { type: "message", fromUserId, fromName: cleanText(fromName || "Someone"), message: cleanText(message, 160) });
  return c.json({ ok: true });
});

// ── Teams ─────────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/teams", async (c) => {
  const { userId, name, level, description, location } = await c.req.json();
  if (!userId || !name?.trim()) return c.json({ error: "Missing fields" }, 400);
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const id = crypto.randomUUID();
  const team = { id, name: name.trim(), level: level || "Men's League", description: description?.trim() || "", location: location?.trim() || "", createdBy: userId, members: [userId], createdAt: new Date().toISOString() };
  await kv.set(`team_${id}`, team);
  return c.json({ team });
});

app.get("/make-server-4cb0fb87/teams", async (c) => {
  const teams = await kv.getByPrefix("team_");
  const enriched = await Promise.all(teams.map(async (team: any) => {
    const profiles = await Promise.all((team.members || []).slice(0, 5).map((uid: string) => kv.get(`profile_${uid}`)));
    return { ...team, memberProfiles: profiles.filter(Boolean).map((p: any) => ({ userId: p.userId, firstName: p.firstName, lastName: p.lastName, position: p.position })) };
  }));
  return c.json({ teams: enriched.filter(Boolean) });
});

app.post("/make-server-4cb0fb87/teams/:id/join", async (c) => {
  const id = c.req.param("id");
  const { userId } = await c.req.json();
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const team = await kv.get(`team_${id}`);
  if (!team) return c.json({ error: "Not found" }, 404);
  if (!team.members.includes(userId)) team.members = [...team.members, userId];
  await kv.set(`team_${id}`, team);
  return c.json({ ok: true });
});

app.post("/make-server-4cb0fb87/teams/:id/leave", async (c) => {
  const id = c.req.param("id");
  const { userId } = await c.req.json();
  const auth = await requireUser(c, userId);
  if (auth.error) return auth.error;
  const team = await kv.get(`team_${id}`);
  if (!team) return c.json({ error: "Not found" }, 404);
  team.members = team.members.filter((m: string) => m !== userId);
  await kv.set(`team_${id}`, team);
  return c.json({ ok: true });
});

app.delete("/make-server-4cb0fb87/teams/:id", async (c) => {
  const id = c.req.param("id");
  const auth = await requireUser(c);
  if (auth.error) return auth.error;
  const team = await kv.get(`team_${id}`);
  if (!team) return c.json({ error: "Not found" }, 404);
  if (team.createdBy !== auth.user.id && !isAdminEmail(auth.user.email)) return c.json({ error: "Admin required" }, 403);
  await kv.del(`team_${id}`);
  return c.json({ ok: true });
});

Deno.serve(app.fetch);
