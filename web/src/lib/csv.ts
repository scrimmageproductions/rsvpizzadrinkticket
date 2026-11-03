import type { HostGuest } from "@/lib/types";

/** RFC 4180 quoting + spreadsheet formula-injection guard for user-entered text (guest names). */
function cell(v: string | number): string {
  if (typeof v === "number") return String(v);
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const REPORT_COLUMNS = [
  "Guest Name",
  "RSVP Status",
  "Tickets Minted",
  "Tickets Redeemed by Guest",
  "Tickets Redeemed by Admin (Vouch)",
  "Tickets Transferred",
  "Transferred In",
  "Transferred Out",
  "Tickets Remaining",
] as const;

const statusLabel = (g: HostGuest) =>
  g.claimedAt ? "Checked in · claimed" : g.status === "checked_in" ? "Checked in" : "RSVP'd (no show)";

/**
 * End-of-night report. "Tickets Transferred" is the NET change (+ received, − given away)
 * so the columns reconcile: Minted + Transferred − Redeemed(guest) − Redeemed(admin) = Remaining.
 */
export function buildReportCsv(guests: HostGuest[]): string {
  const rows = guests.map((g) => {
    const remaining = Object.values(g.remaining).reduce((a, b) => a + b, 0);
    const net = g.transferredIn - g.transferredOut;
    return [g.name, statusLabel(g), g.minted, g.redeemedByGuest, g.redeemedByAdmin, net, g.transferredIn, g.transferredOut, remaining];
  });
  const sum = (i: number) => rows.reduce((a, r) => a + (r[i] as number), 0);
  const totals = ["TOTAL", `${guests.length} guests`, sum(2), sum(3), sum(4), sum(5), sum(6), sum(7), sum(8)];
  return [REPORT_COLUMNS, ...rows, totals].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Pure front-end download (works in Demo Mode with no backend). */
export function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 names (emoji, accents) correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
