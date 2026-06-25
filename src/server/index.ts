import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { migrate } from "./db/index.js";
import { registerRoutes } from "./routes/index.js";
import { startScheduler } from "./monitor/scheduler.js";

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  migrate();

  const app = Fastify({ logger: true });
  await registerRoutes(app);

  // Em produção, serve a UI buildada (Vite -> dist/ui). Em dev, use `pnpm dev:ui`.
  const uiDir = join(process.cwd(), "dist", "ui");
  if (existsSync(uiDir)) {
    await app.register(fastifyStatic, { root: uiDir });
  }

  startScheduler();

  await app.listen({ port: PORT, host: "127.0.0.1" });
  app.log.info(`Sismógrafo no ar em http://127.0.0.1:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
