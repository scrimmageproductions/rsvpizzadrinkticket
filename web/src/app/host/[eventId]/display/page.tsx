import { Suspense } from "react";
import { Splash } from "@/components/Splash";
import { BarDisplay } from "./BarDisplay";

/** Staff-facing "tonight's color" screen for behind the bar. */
export default function DisplayPage({ params }: PageProps<"/host/[eventId]/display">) {
  return (
    <Suspense fallback={<Splash />}>
      {params.then(({ eventId }) => (
        <BarDisplay eventId={eventId} />
      ))}
    </Suspense>
  );
}
