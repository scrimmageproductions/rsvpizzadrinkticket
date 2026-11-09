/**
 * Seed the LOCAL D1 used by `npm run dev` / `npm start` (the CLI has no local query command).
 *   npm run db:migrate:local && npm run db:seed:local
 * Remote: paste d1/seed.sql into the dashboard console, or `cf d1 query <id> --sql "$(cat d1/seed.sql)"`.
 */
import { readFileSync } from "node:fs";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const DB_ID = "4c79d4e7-b9b3-4438-97a1-70ea79e21a64"; // keep in sync with cloudflare.config.ts
const sql = readFileSync(new URL("../d1/seed.sql", import.meta.url), "utf8");
const statements = sql
  .split("\n")
  .map((l) => l.replace(/--.*$/, ""))
  .join("\n")
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-11-09",
    d1Databases: { DB: DB_ID },
  }),
  // same local state directory the dev / preview server reads
  // (the cf CLI keeps local D1 under <state>/v3)
  resourcePersistencePath: new URL("../.cloudflare/state/v3", import.meta.url).pathname,
});
const db = await mf.getD1Database("DB");
for (const s of statements) await db.prepare(s).run();
const { n } = (await db.prepare("SELECT COUNT(*) AS n FROM rsvps").first<{ n: number }>())!;
console.log(`seeded local D1 (${n} RSVPs)`);
await mf.dispose();
