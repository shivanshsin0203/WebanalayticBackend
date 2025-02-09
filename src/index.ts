import { Hono } from "hono";
import { cors } from "hono/cors";
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

export default app;
