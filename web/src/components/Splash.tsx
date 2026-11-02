/** Server-safe loading screen (used as the Suspense fallback while route params resolve). */
export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-tomato border-t-transparent" />
    </div>
  );
}
