import { Suspense } from "react";
import { Splash } from "@/components/Splash";
import { HostDashboard } from "./HostDashboard";

/** Host + door staff dashboard (tablet / desktop). */
export default function HostPage({ params }: PageProps<"/host/[eventId]">) {
  return (
    <Suspense fallback={<Splash />}>
      {params.then(({ eventId }) => (
        <HostDashboard eventId={eventId} />
      ))}
    </Suspense>
  );
}
