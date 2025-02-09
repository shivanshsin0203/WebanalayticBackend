import { Hono } from "hono";
import { cors } from "hono/cors";
import redis from "./redis/db";
const app = new Hono();
app.use(cors());

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.post('/items', async (c) => {
  try {
    const item = await c.req.json()
    console.log(item)
    return c.json({ id: item }, 201)
  } catch (error) {
    return c.json({ error: 'Failed to create item' }, 500)
  }
})
app.post("/track", async (c) => {
  
  const body = await c.req.json();
  console.log(body)
  const keyId = body.keyId 
 
  const sessionId = body.sessionId
  const device =  body.device
  const country = body.country
  const sessionIdPresent = body.sessionIdPresent

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
  const onlineUsers = await redis.scard(`online_users:${keyId}`) || 0;

  return c.json({
    views,
    uniqueViews,
    devices: { mobile, desktop, tablet },
    countries: { us, india, france },
    onlineUsers,
  });
});


export default app;
