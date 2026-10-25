import { createApp } from "./app.js";
import { config } from "./config.js";
import prisma from "./lib/prisma.js";

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`DeskSpot API listening on http://${config.host}:${config.port} (${config.nodeEnv})`);
  console.log(`API docs: http://localhost:${config.port}/api/docs`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
