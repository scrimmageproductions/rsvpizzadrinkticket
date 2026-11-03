"use client";

import { hostBackend } from "@/lib/backend";
import { buildReportCsv, downloadCsv } from "@/lib/csv";

/** End-of-night reconciliation export. Built entirely in the browser from the ledger feed. */
export function ExportReport({ eventId }: { eventId: string }) {
  const { data } = hostBackend.useHostGuests(eventId);
  return (
    <button
      disabled={!data}
      onClick={() => {
        if (!data) return;
        const day = new Date().toISOString().slice(0, 10);
        downloadCsv(`rsvpizza-${eventId}-end-of-night-${day}.csv`, buildReportCsv(data));
      }}
      className="w-full border-2 border-line px-5 py-3 font-mono text-xs uppercase tracking-widest text-paper hover:border-paper disabled:opacity-40 sm:w-auto"
    >
      ⤓ Download end-of-night report (CSV)
    </button>
  );
}
