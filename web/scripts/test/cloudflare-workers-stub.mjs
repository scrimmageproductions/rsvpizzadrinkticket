// Test stand-in for `import { env } from "cloudflare:workers"`.
export const env = (globalThis.__CF_ENV__ ??= {});
