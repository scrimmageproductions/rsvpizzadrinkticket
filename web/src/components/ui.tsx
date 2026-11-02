"use client";

import { motion } from "framer-motion";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-xl tracking-tight lowercase ${className}`}>
      rsv<span className="text-tomato">.</span>pizza
    </span>
  );
}

/** Mobile-first frame used by every guest screen. */
export function Shell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="grain mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-3">
        <Logo />
        {right}
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "paper";
  loading?: boolean;
};

export function Button({ variant = "primary", loading, className = "", children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-tomato text-ink border-paper shadow-brutal",
    paper: "bg-paper text-ink border-paper shadow-brutal-tomato",
    ghost: "bg-transparent text-paper border-line",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`press w-full border-2 px-5 py-4 font-display text-lg uppercase tracking-wide disabled:opacity-40 disabled:shadow-none ${styles} ${className}`}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <motion.span
      className={`inline-block h-5 w-5 rounded-full border-[3px] border-current border-t-transparent align-middle ${className}`}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
      aria-label="loading"
    />
  );
}

export function Pill({ tone = "mute", children }: { tone?: "mute" | "ok" | "warn" | "bad"; children: ReactNode }) {
  const c = {
    mute: "border-line text-mute",
    ok: "border-basil text-basil",
    warn: "border-cheese text-cheese",
    bad: "border-void text-void",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest ${c}`}>
      {children}
    </span>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs uppercase tracking-[0.25em] text-mute">{children}</p>;
}

export function H1({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h1 className={`font-display text-5xl uppercase leading-[0.9] tracking-tight ${className}`}>{children}</h1>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <motion.p
      initial={{ x: -8 }}
      animate={{ x: [-8, 8, -6, 6, 0] }}
      transition={{ duration: 0.35 }}
      className="border-l-4 border-void bg-void/10 px-3 py-2 text-sm text-paper"
      role="alert"
    >
      {children}
    </motion.p>
  );
}
