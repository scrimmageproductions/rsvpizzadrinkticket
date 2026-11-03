"use client";

import { DEMO } from "@/lib/mode";
import { demoGuest, demoHost } from "./demo";
import { liveGuest, liveHost } from "./live";

/** Chosen once at build time (DEMO is an inlined constant), so hook call order never changes. */
export const guestBackend = DEMO ? demoGuest : liveGuest;
export const hostBackend = DEMO ? demoHost : liveHost;

export type * from "./types";
