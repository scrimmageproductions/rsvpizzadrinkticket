import { redirect } from "next/navigation";
import { DEMO_EVENT_ID } from "@/lib/mode";

/** Convenience entry point for staff. Everything behind it is gated by HostGate. */
export default function Admin() {
  redirect(`/host/${process.env.NEXT_PUBLIC_DEFAULT_EVENT_ID ?? DEMO_EVENT_ID}?tab=settings`);
}
