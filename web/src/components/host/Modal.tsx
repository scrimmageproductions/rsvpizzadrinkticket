"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function Modal({ title, kicker, onClose, children }: { title: string; kicker?: string; onClose: () => void; children: ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label={title}
        className="w-full max-w-lg border-2 border-paper bg-ink p-5 shadow-brutal"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {kicker && <p className="font-mono text-xs uppercase tracking-[0.25em] text-mute">{kicker}</p>}
            <h2 className="font-display text-3xl uppercase leading-none">{title}</h2>
          </div>
          <button onClick={onClose} className="border-2 border-line px-3 py-1 font-mono text-xs uppercase" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
