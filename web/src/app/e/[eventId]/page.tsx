import { Suspense } from "react";
import { Splash } from "@/components/Splash";
import { GuestHome } from "./GuestHome";

/** Guest app: Auth → Claim (PIN) → Wallet. */
export default function GuestPage({ params }: PageProps<"/e/[eventId]">) {
  return (
    <Suspense fallback={<Splash />}>
      {params.then(({ eventId }) => (
        <GuestHome eventId={eventId} />
      ))}
    </Suspense>
  );
}
