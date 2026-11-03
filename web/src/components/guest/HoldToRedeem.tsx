"use client";

import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls } from "framer-motion";
import { useRef, useState } from "react";
import { readableInk } from "@/lib/theme";

const HOLD_MS = 1500;
const MOVE_CANCEL_PX = 40;

/**
 * Press-and-hold trigger (1.5 s). A dark "pour" fills the button from the bottom; letting go,
 * sliding off, or scrolling cancels and drains it. Prevents guests burning tickets by bumping
 * their phone in line, while staying a single, huge, no-aim gesture for the bartender.
 *
 * Contrast: the label is drawn twice — once over the base color, once (clipped to the fill)
 * over the fill color — each in whichever of black / white has the higher WCAG contrast.
 */
export function HoldToRedeem({
  onComplete,
  disabled,
  label = "Redeem",
  idleHint,
  baseColor = "#FF4D1C",
  fillColor = "#0A0A0A",
  className = "",
  ariaLabel,
}: {
  onComplete: () => void;
  disabled?: boolean;
  label?: string;
  idleHint: string;
  baseColor?: string;
  fillColor?: string;
  className?: string;
  ariaLabel: string;
}) {
  const progress = useMotionValue(0);
  const clip = useTransform(progress, (p) => `inset(${(1 - p) * 100}% 0 0 0)`);
  const ctrl = useRef<AnimationPlaybackControls | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const done = useRef(false);
  const [holding, setHolding] = useState(false);
  const lastBuzz = useRef(0);

  const baseInk = readableInk(baseColor);
  const fillInk = readableInk(fillColor);

  useMotionValueEvent(progress, "change", (p) => {
    // Haptic ticks at 1/3 and 2/3 so the bartender feels it working.
    const step = Math.floor(p * 3);
    if (step > lastBuzz.current && step < 3) {
      lastBuzz.current = step;
      navigator.vibrate?.(12);
    }
  });

  function start() {
    if (disabled || done.current) return;
    setHolding(true);
    lastBuzz.current = 0;
    navigator.vibrate?.(8);
    ctrl.current?.stop();
    ctrl.current = animate(progress, 1, {
      duration: ((1 - progress.get()) * HOLD_MS) / 1000,
      ease: "linear",
      onComplete: () => {
        done.current = true;
        setHolding(false);
        navigator.vibrate?.(80);
        onComplete();
        // Reset quietly behind the success overlay for the next ticket.
        setTimeout(() => {
          progress.set(0);
          done.current = false;
        }, 600);
      },
    });
  }

  function cancel() {
    if (done.current) return;
    origin.current = null;
    setHolding(false);
    ctrl.current?.stop();
    ctrl.current = animate(progress, 0, { duration: 0.25, ease: "easeOut" });
  }

  const content = (ink: string, hint: string) => (
    <>
      <span className="font-display text-[18vw] uppercase leading-none tracking-tighter sm:text-8xl" style={{ color: ink }}>
        {label}
      </span>
      <span className="font-mono text-sm font-bold uppercase tracking-[0.3em]" style={{ color: ink }}>
        {hint}
      </span>
    </>
  );

  const hint = disabled ? idleHint : holding ? "keep holding…" : idleHint;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = { x: e.clientX, y: e.clientY };
        start();
      }}
      onPointerMove={(e) => {
        const o = origin.current;
        if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_CANCEL_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => (e.key === " " || e.key === "Enter") && cancel()}
      onContextMenu={(e) => e.preventDefault()}
      animate={{ scale: holding ? 0.98 : 1 }}
      className={`relative flex select-none flex-col items-center justify-center gap-4 overflow-hidden border-4 border-paper shadow-brutal [-webkit-touch-callout:none] [touch-action:none] disabled:opacity-40 ${className}`}
      style={{ backgroundColor: baseColor }}
    >
      {/* base layer */}
      <span className="relative flex flex-col items-center gap-4">{content(baseInk, hint)}</span>

      {/* fill layer: rises from the bottom, label re-drawn in the contrasting ink */}
      <motion.span
        aria-hidden
        className="absolute inset-0 flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: fillColor, clipPath: clip }}
      >
        {content(fillInk, hint)}
      </motion.span>

      {/* idle breathing hint */}
      {!holding && !disabled && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2"
          style={{ backgroundColor: fillColor }}
          animate={{ opacity: [0.2, 0.7, 0.2] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
        />
      )}
    </motion.button>
  );
}
