import { Suspense } from "react";
import { Splash } from "@/components/Splash";
import { Redeem } from "./Redeem";

/** Redemption + Success screen (bartender taps here). */
export default function RedeemPage({ params }: PageProps<"/e/[eventId]/redeem/[tokenId]">) {
  return (
    <Suspense fallback={<Splash />}>
      {params.then(({ eventId, tokenId }) => (
        <Redeem eventId={eventId} tokenId={Number(tokenId)} />
      ))}
    </Suspense>
  );
}
