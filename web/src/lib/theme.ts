/**
 * Visual 2FA — "Theme Color of the Night".
 *
 * The bartender knows tonight's color (staff display behind the bar / host briefing).
 * A guest's success screen is only trustworthy if it flashes *that* color right now.
 * Screenshots, screen recordings and look-alike pages built earlier in the night fail
 * the check as soon as the color rotates.
 */

export type ThemeKey = keyof typeof PALETTE;

export const PALETTE = {
  "neon-green": { name: "Neon Green", hex: "#39FF14", ink: "#000000" },
  "hot-pink": { name: "Hot Pink", hex: "#FF2E88", ink: "#000000" },
  "electric-blue": { name: "Electric Blue", hex: "#1F51FF", ink: "#FFFFFF" },
  "safety-orange": { name: "Safety Orange", hex: "#FF6A00", ink: "#000000" },
  "ultra-violet": { name: "Ultra Violet", hex: "#8F00FF", ink: "#FFFFFF" },
  "cyber-yellow": { name: "Cyber Yellow", hex: "#FFE600", ink: "#000000" },
  "aqua-mint": { name: "Aqua Mint", hex: "#00FFD1", ink: "#000000" },
  "blood-red": { name: "Blood Red", hex: "#E10600", ink: "#FFFFFF" },
} as const;

export const THEME_KEYS = Object.keys(PALETTE) as ThemeKey[];

export function isThemeKey(v: unknown): v is ThemeKey {
  return typeof v === "string" && v in PALETTE;
}

export type ThemeConfig = {
  theme_mode: "manual" | "auto";
  theme_color: string;
  theme_palette: string[];
  rotation_minutes: number;
};

export type ResolvedTheme = {
  key: ThemeKey;
  name: string;
  hex: string;
  ink: string;
  /** epoch ms when this color stops being valid (auto mode), or null (manual: until host changes it). */
  validUntil: number | null;
};

/**
 * Deterministic: every server instance (and the staff display) computes the same color for
 * the same wall-clock slot, so there's no cron job or shared timer to keep in sync.
 */
export function resolveTheme(cfg: ThemeConfig, now = Date.now()): ResolvedTheme {
  if (cfg.theme_mode === "auto") {
    const palette = cfg.theme_palette.filter(isThemeKey);
    const keys = palette.length ? palette : THEME_KEYS;
    const slotMs = Math.max(1, cfg.rotation_minutes) * 60_000;
    const slot = Math.floor(now / slotMs);
    const key = keys[slot % keys.length];
    return { key, ...PALETTE[key], validUntil: (slot + 1) * slotMs };
  }
  const key = isThemeKey(cfg.theme_color) ? cfg.theme_color : "neon-green";
  return { key, ...PALETTE[key], validUntil: null };
}
