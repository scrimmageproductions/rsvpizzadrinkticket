/**
 * Visual 2FA — "Theme Color of the Night".
 *
 * The bartender knows tonight's color (staff display behind the bar / host briefing).
 * A guest's success screen is only trustworthy if it flashes *that* color right now.
 * Screenshots, screen recordings and look-alike pages built earlier in the night fail
 * the check as soon as the color rotates.
 */

/**
 * Pick stark black or stark white text for any background, whichever has the higher WCAG
 * contrast ratio. Used for every surface whose color can change (theme colors, the REDEEM
 * button's base and fill), so text stays legible in a dark, loud bar.
 */
export function readableInk(hex: string): "#000000" | "#FFFFFF" {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.replace(/./g, (c) => c + c) : m;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const vsBlack = (L + 0.05) / 0.05;
  const vsWhite = 1.05 / (L + 0.05);
  return vsBlack >= vsWhite ? "#000000" : "#FFFFFF";
}

const BASE = {
  "neon-green": { name: "Neon Green", hex: "#39FF14" },
  "hot-pink": { name: "Hot Pink", hex: "#FF2E88" },
  "electric-blue": { name: "Electric Blue", hex: "#1F51FF" },
  "safety-orange": { name: "Safety Orange", hex: "#FF6A00" },
  "ultra-violet": { name: "Ultra Violet", hex: "#8F00FF" },
  "cyber-yellow": { name: "Cyber Yellow", hex: "#FFE600" },
  "aqua-mint": { name: "Aqua Mint", hex: "#00FFD1" },
  "blood-red": { name: "Blood Red", hex: "#E10600" },
} as const;

export type ThemeKey = keyof typeof BASE;

export const PALETTE = Object.fromEntries(
  Object.entries(BASE).map(([k, v]) => [k, { ...v, ink: readableInk(v.hex) }]),
) as Record<ThemeKey, { name: string; hex: string; ink: "#000000" | "#FFFFFF" }>;

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

/**
 * The slot after `current` (auto mode only). The server sends current + next — never the whole
 * palette / rotation config — so a guest can't precompute tonight's schedule, but their phone can
 * still cross a rotation boundary offline without showing the old color.
 */
export function nextTheme(cfg: ThemeConfig, current: ResolvedTheme): ResolvedTheme | null {
  return current.validUntil ? resolveTheme(cfg, current.validUntil) : null;
}

/**
 * Synchronous, clock-corrected pick for the redemption frame.
 * `at` must be SERVER time (Date.now() + clockOffset). `stale` = beyond what we were told about.
 */
export function pickTheme(
  current: ResolvedTheme,
  next: ResolvedTheme | null,
  at: number,
): { theme: ResolvedTheme; stale: boolean } {
  if (current.validUntil === null || at < current.validUntil) return { theme: current, stale: false };
  if (next && (next.validUntil === null || at < next.validUntil)) return { theme: next, stale: false };
  return { theme: next ?? current, stale: true };
}
