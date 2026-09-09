"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Plus,
  Users,
} from "lucide-react";
import { Cube } from "@/components/ui/primitives";

const primaryNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vacancies", label: "Vacancies", icon: Briefcase },
  { href: "/vacancies/new", label: "Create vacancy", icon: Plus },
];

interface SidebarProps {
  organizationName?: string;
  userEmail?: string;
  userRole?: string;
}

function initials(value: string): string {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "WB";
}

export default function Sidebar({
  organizationName = "Acme Org",
  userEmail = "admin@whitebox.local",
  userRole = "Owner",
}: SidebarProps) {
  const pathname = usePathname();
  const vacancyId = pathname.match(/^\/vacancies\/([^/]+)/)?.[1];
  const inVacancy = Boolean(vacancyId && vacancyId !== "new");

  return (
    <aside className="grain fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-hairline bg-void lg:flex">
      {/* Zone 1 — control */}
      <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
        <div className="flex items-center gap-2.5 text-left">
          <span className="grid size-8 place-items-center">
            <Cube size={28} />
          </span>
          <span>
            <span className="block text-[13px] font-medium text-hi">WhiteBox</span>
            <span className="block max-w-[110px] truncate text-[10px] text-lo">{organizationName}</span>
          </span>
        </div>
      </div>

      {/* Zone 2 — primary nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        <div className="mb-1 px-4 font-mono text-[9px] uppercase tracking-[.1em] text-lo">Workspace</div>
        {primaryNav.map((item) => {
          const active = pathname === item.href || (item.label === "Candidates" && pathname.includes("/candidates/"));
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`group relative flex h-10 items-center gap-3 px-4 text-[14px] transition-colors duration-150 ${
                active ? "bg-irisa/10 text-hi" : "text-mid hover:bg-white/[0.03] hover:text-hi"
              }`}
            >
              {active && <span className="absolute inset-y-1.5 left-0 w-[2px] iris-line" />}
              <Icon className="size-[18px]" strokeWidth={1.5} />
              {item.label}
            </Link>
          );
        })}
        {/* Zone 3 — contextual (inside a vacancy) */}
        {inVacancy && vacancyId && (
          <div className="mt-5 border-t border-hairline pt-4">
            <div className="px-4 text-[10px] text-lo">This vacancy</div>
            <div className="mt-1.5">
              <Link
                href={`/vacancies/${vacancyId}/ranking`}
                className={`relative flex h-8 items-center gap-2 pl-6 pr-4 text-[13px] transition-colors ${
                  pathname.includes(`/vacancies/${vacancyId}/`)
                    ? "text-hi"
                    : "text-lo hover:text-mid"
                }`}
              >
                <Users className="size-3.5" />
                Candidates
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Bottom — pinned */}
      <div className="border-t border-hairline">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-full border border-hairline bg-surface font-mono text-[11px] text-mid">
            {initials(userEmail)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[12px] text-hi">{userEmail}</div>
            <div className="text-[10px] text-lo">{userRole}</div>
          </div>
        </div>
        <form action="/api/auth/logout" method="post" className="px-4 pb-3">
          <button type="submit" className="w-full rounded-md border border-hairline px-3 py-2 text-left text-[11px] text-lo hover:border-hairline-strong hover:text-hi">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
