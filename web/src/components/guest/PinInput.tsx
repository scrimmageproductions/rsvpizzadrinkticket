"use client";

import { motion } from "framer-motion";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

/** Must match the host-side limit in api/host/[eventId]/settings (3–12 alphanumerics). */
export const PIN_MAX = 12;
const clean = (v: string) => v.replace(/[^0-9a-z]/gi, "").toUpperCase().slice(0, PIN_MAX);

export type PinInputHandle = { focus: () => void };

/**
 * Event PIN entry that works the same on phones and desktops.
 *
 *  • Touch / mouse: tapping or clicking ANY box focuses the real input (onClick) — on phones that
 *    opens the keyboard because it happens inside the user gesture. Boxes cancel mousedown so
 *    focus never leaves the input mid-gesture.
 *  • Physical keyboard: the input handles keys when focused (onKeyDown: Enter submits,
 *    Backspace/Delete edit). When nothing is focused — e.g. a laptop user who simply starts
 *    typing — a page-level keydown listener catches 0-9 / A-Z / Backspace / Enter and routes
 *    them here, then moves focus into the field.
 *  • Paste and one-time-code autofill go through the real input's onChange.
 *  • Visible focus state: the next box gets a blinking caret + ring, so it never looks "dead".
 */
export const PinInput = forwardRef<
  PinInputHandle,
  {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
    minLength?: number;
  }
>(function PinInput({ value, onChange, onSubmit, disabled = false, minLength = 4 }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const focus = useCallback(() => {
    const el = inputRef.current;
    if (!el || disabled) return;
    el.focus({ preventScroll: true });
    // Put the caret at the end so typing appends.
    const n = el.value.length;
    el.setSelectionRange?.(n, n);
  }, [disabled]);

  useImperativeHandle(ref, () => ({ focus }), [focus]);

  // Auto-focus as soon as the field unlocks (desktop: type immediately; mobile: keyboard opens).
  useEffect(() => {
    if (!disabled) focus();
  }, [disabled, focus]);

  // Page-level keyboard capture: only when focus isn't already in some other text field.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t === inputRef.current) return; // the input handles its own keys
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;

      if (/^[0-9a-z]$/i.test(e.key)) {
        e.preventDefault();
        onChange(clean(value + e.key));
        focus();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onChange(value.slice(0, -1));
        focus();
      } else if (e.key === "Enter" && value.length >= minLength) {
        // Let real buttons keep their own Enter behaviour.
        if (t?.tagName === "BUTTON" || t?.tagName === "A") return;
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, value, onChange, onSubmit, focus, minLength]);

  const slots = Math.max(minLength, value.length + (value.length < PIN_MAX && !disabled ? 1 : 0));
  const active = Math.min(value.length, slots - 1);

  return (
    <div className="relative" onClick={focus}>
      {/* The real field: visually hidden but focusable, so mobile keyboards, paste and
          autofill all work. Not stretched over the boxes, so it never steals clicks. */}
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(clean(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (value.length >= minLength) onSubmit();
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={PIN_MAX}
        aria-label="Event PIN"
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
      />

      <div className={`grid gap-3 ${slots > 4 ? "grid-cols-6" : "grid-cols-4"}`} aria-hidden>
        {Array.from({ length: slots }).map((_, i) => {
          const char = value[i];
          const isCaret = focused && i === active && !char;
          return (
            <motion.div
              key={i}
              data-pin-box
              // Boxes never take focus themselves: keeping focus on the real input means no
              // blur → re-render → lost click (the bug that broke taps on the caret box).
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                focus();
              }}
              animate={{ scale: char ? [1, 1.08, 1] : 1 }}
              className={`flex aspect-square cursor-text items-center justify-center border-2 font-display ${
                slots > 4 ? "text-2xl" : "text-4xl"
              } ${char ? "border-tomato bg-tomato/10" : isCaret || (focused && i === active) ? "border-paper" : "border-line"} ${
                disabled ? "cursor-not-allowed opacity-30" : ""
              }`}
            >
              {char ?? (isCaret ? <Caret /> : "")}
            </motion.div>
          );
        })}
      </div>

      {!disabled && (
        <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-widest text-mute">
          {focused ? "type the PIN · enter to claim" : "click the boxes or just start typing"}
        </p>
      )}
    </div>
  );
});

function Caret() {
  return (
    <motion.span
      className="pointer-events-none inline-block h-[0.9em] w-[3px] bg-paper"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ repeat: Infinity, duration: 1 }}
    />
  );
}
