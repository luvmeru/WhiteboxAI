"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, LayoutDashboard, Search, Sparkles } from "lucide-react";
import { useCommandK } from "./CommandK";

function pageName(pathname: string): string {
  if (pathname.includes("/candidates/CND")) return "Candidate";
  if (pathname.includes("/ranking")) return "Candidates";
  if (pathname.includes("/compare")) return "Compare";
  if (pathname.includes("/invitations")) return "Messages";
  if (pathname.includes("/config")) return "Setup";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname === "/vacancies/new") return "Create vacancy";
  const segment = pathname.split("/").filter(Boolean)[0] ?? "Dashboard";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export default function TopBar() {
  const pathname = usePathname();
  const { open } = useCommandK();

  return (
    <header className="sticky top-0 z-20 flex h-[52px] items-center gap-4 border-b border-hairline bg-void/80 px-6 backdrop-blur">
      <div className="hidden w-36 text-[13px] font-medium text-hi sm:block">
        {pageName(pathname)}
      </div>

      <nav className="flex items-center gap-3 lg:hidden">
        <Link href="/dashboard" aria-label="Dashboard" className="text-mid hover:text-hi">
          <LayoutDashboard className="size-[18px]" />
        </Link>
        <Link href="/vacancies" aria-label="Vacancies" className="text-mid hover:text-hi">
          <Briefcase className="size-[18px]" />
        </Link>
      </nav>

      <div className="flex h-8 w-full max-w-md items-center gap-2 rounded-lg border border-hairline bg-surface px-3 iris-focus sm:ml-2">
        <Search className="size-3.5 text-lo" />
        <input
          className="w-full bg-transparent text-[13px] text-hi placeholder:text-lo focus:outline-none"
          aria-label="Quick navigation"
          placeholder="Jump to a workspace view..."
          onFocus={open}
          readOnly
        />
        <button onClick={open} aria-label="Open quick navigation" className="rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-lo hover:text-hi">⌘K</button>
      </div>

      <div className="ml-auto hidden shrink-0 items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-[10px] text-mid xl:flex">
        <Sparkles className="size-3 text-irisc" /> AI-assisted workspace
      </div>

    </header>
  );
}
