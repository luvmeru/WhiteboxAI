"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  CornerDownLeft,
  LayoutDashboard,
  Plus,
} from "lucide-react";

const Context = createContext<{ open: () => void }>({ open: () => {} });
export const useCommandK = () => useContext(Context);

const items = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    hint: "/dashboard",
    href: "/dashboard",
  },
  {
    icon: Briefcase,
    label: "Vacancies",
    hint: "/vacancies",
    href: "/vacancies",
  },
  {
    icon: Plus,
    label: "Create vacancy",
    hint: "/vacancies/new",
    href: "/vacancies/new",
  },
];

export default function CommandKProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const open = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((value) => !value);
        setQuery("");
        setActive(0);
      }
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? items.filter(
          (item) =>
            item.label.toLowerCase().includes(needle) ||
            item.hint.includes(needle),
        )
      : items;
  }, [query]);

  const go = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  return (
    <Context.Provider value={{ open }}>
      {children}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 px-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="mx-auto mt-[14vh] w-full max-w-[560px] overflow-hidden rounded-xl border border-hairline-strong bg-surface2 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-px w-full iris-line opacity-70" />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  if (visibleItems.length > 0) {
                    setActive((value) =>
                      Math.min(value + 1, visibleItems.length - 1),
                    );
                  }
                }
                if (event.key === "ArrowUp") {
                  setActive((value) => Math.max(value - 1, 0));
                }
                if (event.key === "Enter" && visibleItems[active]) {
                  go(visibleItems[active].href);
                }
              }}
              className="w-full border-b border-hairline bg-transparent px-5 py-4 font-mono text-[14px] text-hi placeholder:text-lo focus:outline-none"
              aria-label="Quick navigation"
              placeholder="Jump to a workspace view..."
            />
            <div className="max-h-[320px] overflow-y-auto py-1.5">
              {visibleItems.length === 0 && (
                <div className="px-5 py-6 text-center text-[13px] text-lo">
                  No route matches “{query}”.
                </div>
              )}
              {visibleItems.map((item, index) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => go(item.href)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] ${
                    index === active ? "bg-white/5 text-hi" : "text-mid"
                  }`}
                >
                  <item.icon className="size-4 text-lo" />
                  <span>{item.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-lo">
                    {item.hint}
                  </span>
                  {index === active && (
                    <CornerDownLeft className="size-3.5 text-lo" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Context.Provider>
  );
}
