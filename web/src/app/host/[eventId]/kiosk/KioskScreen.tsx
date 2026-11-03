"use client";

import { HostGate } from "@/components/host/HostGate";
import { KioskDisplay } from "@/components/host/KioskDisplay";

export function KioskScreen({ eventId }: { eventId: string }) {
  return <HostGate eventId={eventId}>{(data) => <KioskDisplay eventId={eventId} data={data} />}</HostGate>;
}
