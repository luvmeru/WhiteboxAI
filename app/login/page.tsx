import { Cube } from "@/components/ui/primitives";
import { isDemoMode } from "@/lib/server/env";
import { safeRootRelativePath } from "@/lib/server/http";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const demo = isDemoMode();
  const next = safeRootRelativePath(params.next ?? "", "/dashboard");

  return (
    <main className="grain min-h-screen bg-void px-6 py-12 text-hi">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-md flex-col justify-center">
        <div className="flex items-center gap-3">
          <Cube size={42} />
          <div>
            <div className="font-display text-[20px]">WhiteBox</div>
            <div className="hud-label mt-0.5">Secure HR workspace</div>
          </div>
        </div>

        <section className="mt-9 rounded-2xl border border-hairline-strong bg-surface p-7">
          <div className="hud-label">Authentication</div>
          <h1 className="mt-3 font-display text-[28px] tracking-[-0.02em]">Sign in to your workspace.</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-mid">
            Build structured vacancies, review candidate evidence and keep every hiring decision traceable.
          </p>

          <form action="/api/auth/login" method="post" className="mt-7 space-y-4">
            <input type="hidden" name="next" value={next} />
            <label className="block text-[11px] text-mid">
              Work email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                defaultValue={demo ? "admin@whitebox.local" : ""}
                className="iris-focus mt-2 w-full rounded-lg border border-hairline bg-void2 px-4 py-3 text-[14px] text-hi"
              />
            </label>
            <label className="block text-[11px] text-mid">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                defaultValue={demo ? "WhiteBox!2026" : ""}
                className="iris-focus mt-2 w-full rounded-lg border border-hairline bg-void2 px-4 py-3 text-[14px] text-hi"
              />
            </label>
            {params.error && (
              <p role="alert" className="rounded-lg border border-neg/30 bg-neg/5 px-3 py-2 text-[12px] text-neg">
                {params.error === "rate"
                  ? "Too many sign-in attempts. Wait a few minutes and try again."
                  : params.error === "service"
                    ? "The sign-in service is temporarily unavailable. Try again shortly."
                  : "The email or password is not valid."}
              </p>
            )}
            <button className="w-full rounded-lg bg-paper px-4 py-3 text-[13px] font-medium text-void">
              Sign in
            </button>
          </form>

        </section>

        <div className="hidden">
          ← Candidate entry
        </div>
      </div>
    </main>
  );
}
