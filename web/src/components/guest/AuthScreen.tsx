"use client";

import { DEMO } from "@/lib/mode";
import { DemoAuthScreen } from "./DemoAuthScreen";
import { PrivyAuthScreen } from "./PrivyAuthScreen";

/** From a pre-arrival invite link: who to log in, and whether to fire the code automatically. */
export type AuthPrefill = { identifier: string; kind: "email" | "phone"; name?: string; autoSend?: boolean };

/** 1. AUTH — Privy (live) or the instant mock login (Demo Mode). */
export const AuthScreen = DEMO ? DemoAuthScreen : PrivyAuthScreen;
