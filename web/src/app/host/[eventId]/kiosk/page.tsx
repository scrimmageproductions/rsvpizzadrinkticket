import { Suspense } from "react";
import { Splash } from "@/components/Splash";
import { KioskScreen } from "./KioskScreen";

/** Guest-facing door kiosk (rotating check-in QR). Staff log in once, then leave the device. */
export default function KioskPage({ params }: PageProps<"/host/[eventId]/kiosk">) {
  return (
    <Suspense fallback={<Splash />}>
      {params.then(({ eventId }) => (
        <KioskScreen eventId={eventId} />
      ))}
    </Suspense>
  );
}
