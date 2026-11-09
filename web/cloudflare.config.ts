import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "rsvpizza",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-09",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // The app database (replaces Supabase). Schema: ./migrations, applied with `cf d1 migrations apply`.
      DB: bindings.d1({ name: "rsvpizza", id: "4c79d4e7-b9b3-4438-97a1-70ea79e21a64" }),

      // Server secrets — set in production with `cf workers secrets put <NAME>`, locally in .dev.vars.
      // Workers mirror them into process.env (nodejs_compat), which is how the server code reads them.
      PRIVY_APP_SECRET: bindings.secret(),
      PIMLICO_API_KEY: bindings.secret(),
      CLAIM_SIGNER_PRIVATE_KEY: bindings.secret(),
      ADMIN_PRIVATE_KEY: bindings.secret(),
      APP_SECRET: bindings.secret(),
      // Not strictly secret, but per-deployment and personal (staff emails), so kept out of git.
      HOST_EMAILS: bindings.secret(),
      PIMLICO_SPONSORSHIP_POLICY_ID: bindings.secret(),
    },
  }),
});
