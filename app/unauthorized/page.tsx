import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-void p-6 text-hi">
      <section className="max-w-md rounded-xl border border-hairline bg-surface p-7 text-center">
        <div className="hud-label">Access control</div>
        <h1 className="mt-3 font-display text-[26px]">This role cannot open that workspace.</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mid">
          Ask an organization owner to update your assignment. The denied request was not executed.
        </p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-lg border border-hairline-strong px-4 py-2.5 text-[12px]">
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}

