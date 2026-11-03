"use client";

import { DEMO } from "@/lib/mode";
import { DemoAuthScreen } from "./DemoAuthScreen";
import { PrivyAuthScreen } from "./PrivyAuthScreen";

/** 1. AUTH — Privy (live) or the instant mock login (Demo Mode). */
export const AuthScreen = DEMO ? DemoAuthScreen : PrivyAuthScreen;
