// Node module hook for tests: `cloudflare:workers` only exists inside workerd, so map it to a
// stub whose `env` the test fills with a real (Miniflare) D1 binding.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "cloudflare:workers") {
          return { url: ${JSON.stringify(new URL("./cloudflare-workers-stub.mjs", import.meta.url).href)}, shortCircuit: true };
        }
        return next(specifier, context);
      }`),
);
