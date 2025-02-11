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
  console.log(body);
  const keyId = body.keyId;

  const sessionId = body.sessionId;
  const device = body.device;
  const country = body.country;
  const sessionIdPresent = body.sessionIdPresent;

  if (!keyId || !sessionId || !device || !country) {
    return c.text("Missing parameters!", 400);
  }

  // Increment total views
  await redis.incr(`views:${keyId}`);

  // Track unique views

  if (!sessionIdPresent) {
    await redis.incr(`unique_views:${keyId}`);
  }

  // Increment device count
  await redis.incr(`device:${keyId}:${device}`);

  // Increment country count
  await redis.incr(`country:${keyId}:${country}`);

  await redis.sadd(`online_users:${keyId}`, sessionId);
  await redis.expire(`online_users:${keyId}`, 300);

  return c.json({ message: "View Tracked Successfully" });
});
app.get("/analytics", async (c) => {
  const keyId = c.req.query("keyId");

  if (!keyId) {
    return c.text("Missing keyId!", 400);
  }

  // Fetch views & unique views
  const views = (await redis.get(`views:${keyId}`)) || 0;
  const uniqueViews = (await redis.get(`unique_views:${keyId}`)) || 0;

  // Fetch device data
  const mobile = (await redis.get(`device:${keyId}:mobile`)) || 0;
  const desktop = (await redis.get(`device:${keyId}:desktop`)) || 0;
  const tablet = (await redis.get(`device:${keyId}:tablet`)) || 0;

  // Fetch country data
  const us = (await redis.get(`country:${keyId}:US`)) || 0;
  const india = (await redis.get(`country:${keyId}:IN`)) || 0;
  const france = (await redis.get(`country:${keyId}:FR`)) || 0;

  // Fetch online users count
  const onlineUsers = (await redis.scard(`online_users:${keyId}`)) || 0;

  return c.json({
    views,
    uniqueViews,
    devices: { mobile, desktop, tablet },
    countries: { us, india, france },
    onlineUsers,
  });
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
