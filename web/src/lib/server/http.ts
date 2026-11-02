import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./auth";

/** Wraps a route handler: maps HttpError / ZodError to JSON responses. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "bad_request", issues: err.issues }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}

export const json = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
