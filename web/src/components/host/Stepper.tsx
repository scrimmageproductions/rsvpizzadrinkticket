"use client";

/** − [ n ] + quantity picker, clamped to [min, max]. Shared by Wingman Transfer and batch Host Vouch. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max,
  label = "Amount",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max: number;
  label?: string;
}) {
  const shown = Math.max(min, Math.min(value, max));
  return (
    <div className="flex items-center justify-between">
      <p className="font-mono text-xs uppercase tracking-widest text-mute">{label}</p>
      <div className="flex items-center border-2 border-paper">
        <button
          type="button"
          className="px-4 py-2 font-display text-xl disabled:opacity-30"
          disabled={shown <= min}
          onClick={() => onChange(Math.max(min, shown - 1))}
          aria-label="Less"
        >
          −
        </button>
        <span className="w-12 text-center font-display text-2xl tabular-nums" aria-live="polite">
          {shown}
        </span>
        <button
          type="button"
          className="px-4 py-2 font-display text-xl disabled:opacity-30"
          disabled={shown >= max}
          onClick={() => onChange(Math.min(max, shown + 1))}
          aria-label="More"
        >
          +
        </button>
      </div>
    </div>
  );
}
