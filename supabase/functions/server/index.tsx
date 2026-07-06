import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";

const app = new Hono();
app.use("*", logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

app.get("/make-server-4cb0fb87/health", (c) => c.json({ status: "ok" }));

function ytId(url: string): string | null {
  const m = url?.match(/(?:youtu\.be\/|v=|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Profile ───────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/profile", async (c) => {
  const body = await c.req.json();
  const { userId, ...profile } = body;
  if (!userId) return c.json({ error: "userId required" }, 400);
  await kv.set(`profile_${userId}`, { userId, ...profile, updatedAt: new Date().toISOString() });
  const index: string[] = (await kv.get("user_index")) || [];
  if (!index.includes(userId)) await kv.set("user_index", [...index, userId]);
  return c.json({ ok: true });
});

app.get("/make-server-4cb0fb87/profile/:userId", async (c) => {
  const userId = c.req.param("userId");
  const profile = await kv.get(`profile_${userId}`);
  return c.json({ profile: profile || null });
});

// ── Game data ─────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/gamedata", async (c) => {
  const { userId, data } = await c.req.json();
  if (!userId) return c.json({ error: "userId required" }, 400);
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

// ── Posts ─────────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/posts", async (c) => {
  const { userId, content, videoUrl, replyTo, quotedPostId } = await c.req.json();
  if (!userId || (!content?.trim() && !videoUrl)) return c.json({ error: "Content required" }, 400);
  const id = crypto.randomUUID();
  const post = { id, userId, content: content?.trim() || "", videoUrl: videoUrl || null, videoId: videoUrl ? ytId(videoUrl) : null, replyTo: replyTo || null, quotedPostId: quotedPostId || null, createdAt: new Date().toISOString(), likes: [], reposts: [], likeCount: 0, repostCount: 0, replyCount: 0 };
  await kv.set(`post_${id}`, post);
  if (replyTo) { const parent = await kv.get(`post_${replyTo}`); if (parent) { parent.replyCount = (parent.replyCount || 0) + 1; await kv.set(`post_${replyTo}`, parent); } }
  const profile = await kv.get(`profile_${userId}`);
  return c.json({ post: { ...post, profile: profile ? { firstName: profile.firstName, lastName: profile.lastName, position: profile.position } : null } });
});

app.get("/make-server-4cb0fb87/posts", async (c) => {
  const allPosts = await kv.getByPrefix("post_");
  const topLevel = allPosts.filter((p: any) => !p.replyTo).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 60);
  const enriched = await Promise.all(topLevel.map(async (post: any) => {
    const profile = await kv.get(`profile_${post.userId}`);
    let quotedPost = null;
    if (post.quotedPostId) { const qp = await kv.get(`post_${post.quotedPostId}`); if (qp) { const qProfile = await kv.get(`profile_${qp.userId}`); quotedPost = { ...qp, profile: qProfile ? { firstName: qProfile.firstName, lastName: qProfile.lastName, position: qProfile.position } : null }; } }
    return { ...post, profile: profile ? { firstName: profile.firstName, lastName: profile.lastName, position: profile.position } : { firstName: "Player", lastName: "", position: "" }, quotedPost };
  }));
  return c.json({ posts: enriched });
});

app.get("/make-server-4cb0fb87/posts/:postId/replies", async (c) => {
  const postId = c.req.param("postId");
  const allPosts = await kv.getByPrefix("post_");
  const replies = allPosts.filter((p: any) => p.replyTo === postId).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const enriched = await Promise.all(replies.map(async (post: any) => { const profile = await kv.get(`profile_${post.userId}`); return { ...post, profile: profile ? { firstName: profile.firstName, lastName: profile.lastName, position: profile.position } : null }; }));
  return c.json({ replies: enriched });
});

app.post("/make-server-4cb0fb87/posts/:postId/like", async (c) => {
  const postId = c.req.param("postId");
  const { userId } = await c.req.json();
  const post = await kv.get(`post_${postId}`);
  if (!post) return c.json({ error: "Not found" }, 404);
  const liked = (post.likes || []).includes(userId);
  post.likes = liked ? (post.likes || []).filter((id: string) => id !== userId) : [...(post.likes || []), userId];
  post.likeCount = post.likes.length;
  await kv.set(`post_${postId}`, post);
  return c.json({ liked: !liked, likeCount: post.likeCount });
});

app.post("/make-server-4cb0fb87/posts/:postId/repost", async (c) => {
  const postId = c.req.param("postId");
  const { userId } = await c.req.json();
  const post = await kv.get(`post_${postId}`);
  if (!post) return c.json({ error: "Not found" }, 404);
  const reposted = (post.reposts || []).includes(userId);
  post.reposts = reposted ? (post.reposts || []).filter((id: string) => id !== userId) : [...(post.reposts || []), userId];
  post.repostCount = post.reposts.length;
  await kv.set(`post_${postId}`, post);
  return c.json({ reposted: !reposted, repostCount: post.repostCount });
});

app.delete("/make-server-4cb0fb87/posts/:postId", async (c) => {
  const postId = c.req.param("postId");
  await kv.del(`post_${postId}`);
  return c.json({ ok: true });
});

// ── Teams ─────────────────────────────────────────────────────────────────────
app.post("/make-server-4cb0fb87/teams", async (c) => {
  const { userId, name, level, description, location } = await c.req.json();
  if (!userId || !name?.trim()) return c.json({ error: "Missing fields" }, 400);
  const id = crypto.randomUUID();
  const team = { id, name: name.trim(), level: level || "Men's League", description: description?.trim() || "", location: location?.trim() || "", createdBy: userId, members: [userId], createdAt: new Date().toISOString() };
  await kv.set(`team_${id}`, team);
  return c.json({ team });
});

app.get("/make-server-4cb0fb87/teams", async (c) => {
  const allTeams = await kv.getByPrefix("team_");
  const sorted = allTeams.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const enriched = await Promise.all(sorted.map(async (team: any) => {
    const profile = await kv.get(`profile_${team.createdBy}`);
    const memberProfiles = await Promise.all((team.members || []).slice(0, 10).map(async (uid: string) => { const p = await kv.get(`profile_${uid}`); return p ? { userId: uid, firstName: p.firstName, lastName: p.lastName, position: p.position } : null; }));
    return { ...team, creatorName: profile ? `${profile.firstName} ${profile.lastName}` : "Unknown", memberProfiles: memberProfiles.filter(Boolean) };
  }));
  return c.json({ teams: enriched });
});

app.post("/make-server-4cb0fb87/teams/:teamId/join", async (c) => {
  const teamId = c.req.param("teamId");
  const { userId } = await c.req.json();
  const team = await kv.get(`team_${teamId}`);
  if (!team) return c.json({ error: "Not found" }, 404);
  if (!(team.members || []).includes(userId)) { team.members = [...(team.members || []), userId]; await kv.set(`team_${teamId}`, team); }
  return c.json({ ok: true });
});

app.post("/make-server-4cb0fb87/teams/:teamId/leave", async (c) => {
  const teamId = c.req.param("teamId");
  const { userId } = await c.req.json();
  const team = await kv.get(`team_${teamId}`);
  if (!team) return c.json({ error: "Not found" }, 404);
  team.members = (team.members || []).filter((id: string) => id !== userId);
  await kv.set(`team_${teamId}`, team);
  return c.json({ ok: true });
});

app.delete("/make-server-4cb0fb87/teams/:teamId", async (c) => {
  const teamId = c.req.param("teamId");
  await kv.del(`team_${teamId}`);
  return c.json({ ok: true });
});

Deno.serve(app.fetch);
