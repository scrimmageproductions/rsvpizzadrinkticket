import Link from "next/link";
import { Logo } from "@/components/ui";
import { DEMO } from "@/lib/mode";

const personas = [
  {
    who: "Guest",
    what: "Logs in with email / phone. Types the PIN on the wall. Gets drink tickets. Hands phone to bartender.",
    href: "/e/pizza-night-nyc",
    cta: "Open guest app",
  },
  {
    who: "Door staff",
    what: "Finds the name, taps CHECK IN. That's the first of two locks on minting.",
    href: "/host/pizza-night-nyc?tab=door",
    cta: "Open door list",
  },
  {
    who: "Bartender",
    what: "Holds the giant REDEEM button for 1.5s. Screen floods with tonight's color, today's date and a live clock? Pour.",
    href: "/e/pizza-night-nyc",
    cta: "Use a guest phone",
  },
  {
    who: "Host",
    what: "Sets the PIN and the Theme Color of the Night. Vouches for dead phones, moves tickets to a wingman, exports the bar tab.",
    href: "/host/pizza-night-nyc?tab=ledger",
    cta: "Open host dashboard",
  },
];

export default function Home() {
  return (
    <div className="grain mx-auto min-h-dvh max-w-5xl px-5 py-8">
      <header className="flex items-center justify-between border-b-2 border-paper pb-4">
        <Logo className="text-2xl" />
        <span className="hidden font-mono text-xs uppercase tracking-widest text-mute sm:inline">check-in · perks · zero hardware</span>
      </header>

      <section className="py-14">
        <h1 className="font-display text-[15vw] uppercase leading-[0.85] tracking-tighter md:text-9xl">
          The phone
          <br />
          <span className="text-tomato">is the</span> ticket.
        </h1>
        <p className="mt-8 max-w-xl text-lg text-mute">
          No scanners, no QR codes, no staff training. Guests carry their own redemption terminal. Fraud is stopped by
          a <span className="text-paper">dual-layer gated mint</span> and a{" "}
          <span className="text-paper">visual 2FA</span> color that only real tickets can show.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {personas.map((p, i) => (
          <Link
            key={p.who}
            href={p.href}
            className="press group flex flex-col justify-between gap-6 border-2 border-paper bg-ink-2 p-6 shadow-brutal"
          >
            <div>
              <p className="font-mono text-xs text-tomato">0{i + 1}</p>
              <h2 className="font-display text-4xl uppercase">{p.who}</h2>
              <p className="mt-2 text-mute">{p.what}</p>
            </div>
            <span className="font-display uppercase group-hover:text-tomato">{p.cta} →</span>
          </Link>
        ))}
      </section>

      {DEMO && (
        <p className="mt-8 border-2 border-dashed border-cheese p-4 font-mono text-xs uppercase leading-relaxed tracking-widest text-cheese">
          Demo Mode: everything runs in this browser on mock data — no keys needed. Open the guest app and the host
          dashboard in two tabs side by side; they stay in sync. Event PIN: 4209.
        </p>
      )}

      <footer className="mt-16 border-t-2 border-line pt-6 font-mono text-xs uppercase tracking-widest text-mute">
        ERC-1155 soulbound perks · Base · ERC-4337 gasless · built for rsv.pizza
      </footer>
    </div>
  );
}
