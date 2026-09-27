import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

async function bootstrap() {
  const app = await createApp();

  app.listen(port, () => {
    console.log(`Tournament API listening on http://localhost:${port}`);
    if (process.env.STARTGG_DEBUG_SYNC === "1") {
      console.log("[start.gg][debug] sync debug logging enabled");
    }
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
