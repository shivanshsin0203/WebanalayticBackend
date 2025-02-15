import { Hono } from "hono";
import { cors } from "hono/cors";
import redis from "./redis/db";
import { D1Database } from "@cloudflare/workers-types";
import { Bindings } from "hono/types";
import { drizzle } from "drizzle-orm/d1";
import { projects, users } from "./db/schema";
import { eq } from "drizzle-orm";

export type Env = {
  DB: D1Database;
  ANALYTICS:KVNamespace
};
const app = new Hono<{ Bindings: Env }>();
app.use(cors());
app.get("/", (c) => {
  return c.text("Hello Hono!");
});
app.get("/test", async (c) => {
  const db = drizzle(c.env.DB);
  const results = await db.select().from(users).all();
  return c.json(results);
});

app.post("/addUser", async (c) => {
  const db = drizzle(c.env.DB);
  const { name, key, email, image } = await c.req.json();

  // Check if user exists
  let existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  // If user does not exist, create a new one
  if (!existingUser) {
    const insertedUser = await db
      .insert(users)
      .values({ email, isActive: true })
      .returning();
    existingUser = insertedUser[0]; // Assign the newly created user
  }

  // Insert new project
  await db.insert(projects).values({
    userEmail: email, // Must match schema
    key,
    name,
    image,
    date: new Date(), // Drizzle expects a Date object, not timestamp
  });

  return c.json({ message: "User and Project added successfully" }, 200);
});
app.get("/getUser", async (c) => {
  const db = drizzle(c.env.DB);
  const email = c.req.query("email");

  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  // Get user details
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  if (!user) {
    return c.json({ error: "User not found!" }, 404);
  }

  // Get user's projects
  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userEmail, email))
    .all();

  return c.json({ ...user, projects: userProjects }, 200);
});
app.post("/items", async (c) => {
  try {
    const item = await c.req.json();
    console.log(item);
    return c.json({ id: item }, 201);
  } catch (error) {
    return c.json({ error: "Failed to create item" }, 500);
  }
});
app.post("/track", async (c) => {
  const body = await c.req.json();
  const keyId = body.keyId;
  const sessionId = body.sessionId;
  const device = body.device;
  const country = body.country;

  if (!keyId || !sessionId || !device || !country) {
    return c.text("Missing parameters!", 400);
  }
  const today = new Date().toISOString().split("T")[0];
  const dailyViewsKey = `views:${keyId}:${today}`;
  // Increment total views
  const viewKey = `views:${keyId}`;
  const currentViews = parseInt((await c.env.ANALYTICS.get(viewKey)) || "0");
  await c.env.ANALYTICS.put(viewKey, (currentViews + 1).toString());

  // Track unique views using session IDs
  const sessionKey = `sessions:${keyId}:${sessionId}`;
  const isNewSession = !(await c.env.ANALYTICS.get(sessionKey));

  if (isNewSession) {
    await c.env.ANALYTICS.put(sessionKey, "1", { expirationTtl: 86400 });

    const uniqueViewKey = `unique_views:${keyId}`;
    const currentUniqueViews = parseInt((await c.env.ANALYTICS.get(uniqueViewKey)) || "0");
    await c.env.ANALYTICS.put(uniqueViewKey, (currentUniqueViews + 1).toString());
  }

  // Increment device count
  const deviceKey = `device:${keyId}:${device}`;
  const currentDeviceCount = parseInt((await c.env.ANALYTICS.get(deviceKey)) || "0");
  await c.env.ANALYTICS.put(deviceKey, (currentDeviceCount + 1).toString());
  
  // Increment country count
  const countryKey = `country:${keyId}:${country}`;
  const currentCountryCount = parseInt((await c.env.ANALYTICS.get(countryKey)) || "0");
  await c.env.ANALYTICS.put(countryKey, (currentCountryCount + 1).toString());

  // Track online users (store active session IDs)
  const onlineUsersKey = `online_users:${keyId}:${sessionId}`;
  await c.env.ANALYTICS.put(onlineUsersKey, "1", { expirationTtl: 300 });

  const dailyViews = parseInt((await c.env.ANALYTICS.get(dailyViewsKey)) || "0");
  await c.env.ANALYTICS.put(dailyViewsKey, (dailyViews + 1).toString(), { expirationTtl: 60 * 60 * 24 * 30 });

  return c.json({ message: "View Tracked Successfully" });
});

app.get("/analytics", async (c) => {
  const keyId = c.req.query("keyId");

  if (!keyId) return c.text("Missing keyId!", 400);

  const views = (await c.env.ANALYTICS.get(`views:${keyId}`)) || 0;
  const uniqueViews = (await c.env.ANALYTICS.get(`unique_views:${keyId}`)) || 0;

  const mobile = (await c.env.ANALYTICS.get(`device:${keyId}:mobile`)) || 0;
  const desktop = (await c.env.ANALYTICS.get(`device:${keyId}:desktop`)) || 0;
  const tablet = (await c.env.ANALYTICS.get(`device:${keyId}:tablet`)) || 0;

  const us = (await c.env.ANALYTICS.get(`country:${keyId}:US`)) || 0;
  const india = (await c.env.ANALYTICS.get(`country:${keyId}:IN`)) || 0;
  const france = (await c.env.ANALYTICS.get(`country:${keyId}:FR`)) || 0;
  const canada = (await c.env.ANALYTICS.get(`country:${keyId}:CA`)) || 0
  const uk= (await c.env.ANALYTICS.get(`country:${keyId}:GB`)) || 0
  const australia = (await c.env.ANALYTICS.get(`country:${keyId}:AU`)) || 0

  const onlineUsersKeys = await c.env.ANALYTICS.list({ prefix: `online_users:${keyId}:` });
  const onlineUsers = onlineUsersKeys.keys.length;

  return c.json({
    views,
    uniqueViews,
    onlineUsers,
    devices: { mobile, desktop, tablet },
    countries: { us, india, france, canada, uk, australia },
  });
});

app.get("/analytics/daily", async (c) => {
  const keyId = c.req.query("keyId");
  const days = parseInt(c.req.query("days") || "7");

  if (!keyId) return c.text("Missing keyId!", 400);

  const today = new Date();
  let results = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dateString = date.toISOString().split("T")[0];

    const dailyViewsKey = `views:${keyId}:${dateString}`;
    const dailyViews = (await c.env.ANALYTICS.get(dailyViewsKey)) || "0";

    results.push({ date: dateString, views: parseInt(dailyViews) });
  }

  return c.json(results.reverse()); // Reverse for chronological order
});

// app.post("/addUser", async (c) => {
//   const body = await c.req.json();
//   await connectDB();
//   const name = body.name;
//   const key = body.key;
//   const email = body.email;
//   const image = body.image;
//   const newproject = {
//     key: key,
//     name: name,
//     image:image
//   };
//   const user = await User.findOne({ email });
//   if (!user) {
//     console.log("User not found!");
//     c.json({ error: "User not found!" }, 404);
//   }else{
//   user.projects.push(newproject);
//   await user.save();
//   c.json({ message: "Project added successfully" },200);
//   }
// });
// app.get("/getUser", async (c) => {
//   const email = c.req.query("email");
//   await connectDB();
//   const user = await User.findOne({ email });
//   if (!user) {
//     console.log("User not found!");
//     c.json({ error: "User not found!" }, 404);
//   } else {
//     c.json(user);
//   }
// });

export default app;
