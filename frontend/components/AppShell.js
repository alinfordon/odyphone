"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AudioLines,
  Mic,
  Bell,
  ChartColumn,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Fingerprint,
  Sparkles,
  Sun,
  Users,
  Waypoints,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "./AuthProvider";
import { useTheme } from "./ThemeProvider";
import { statusLabel } from "../lib/format";
import { Badge } from "./ui";

const NAV = [
  { href: "/dashboard", label: "Privire de ansamblu", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacte", icon: Users },
  { href: "/rules", label: "Reguli de apel", icon: Waypoints },
  { href: "/calls", label: "Istoric apeluri", icon: History },
  { href: "/assistant", label: "Personalitate AI", icon: Sparkles },
  { href: "/ody-core", label: "ODY Core", icon: Fingerprint },
  { href: "/voice", label: "Setări voce", icon: AudioLines },
  { href: "/voice-lab", label: "Voice Lab", icon: Mic },
  { href: "/notifications", label: "Notificări", icon: Bell },
  { href: "/analytics", label: "Analiză", icon: ChartColumn },
  { href: "/settings", label: "Setări", icon: Settings },
];

function connectionText(status) {
  if (!status) return "Se verifică";
  if (status.api !== "up") return "API indisponibil";
  return "API conectat";
}

export function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [unread, setUnread] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [statusResult, notes] = await Promise.all([
          api("/api/v1/status"),
          api("/api/v1/notifications?limit=1"),
        ]);
        if (stopped) return;
        setStatus(statusResult.data);
        setUnread(notes.meta?.unread || 0);
        setError("");
      } catch (loadError) {
        if (!stopped) setError(loadError.message);
      }
    }
    load();
    const timer = setInterval(load, 20000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  async function toggleAi() {
    if (!status) return;
    setPending(true);
    try {
      const result = await api("/api/v1/settings/ai-enabled", {
        method: "PATCH",
        body: { aiAnsweringEnabled: !status.aiAnsweringEnabled },
      });
      setStatus((current) => ({ ...current, aiAnsweringEnabled: result.data.aiAnsweringEnabled }));
    } catch (toggleError) {
      setError(toggleError.message);
    } finally {
      setPending(false);
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-2 pb-6">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--button)] text-sm font-semibold text-white">ODY</div>
        <div>
          <p className="font-display text-base font-semibold leading-none">ODY Phone AI</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Doar apeluri autorizate</p>
        </div>
      </div>
      <nav className="space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} data-active={active} className="nav-link" onClick={() => setOpen(false)}>
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 pt-6">
        <button type="button" className="panel w-full p-3 text-left" onClick={toggleAi} disabled={pending || !status}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Răspuns AI</span>
            <Badge tone={status?.aiAnsweringEnabled ? "good" : "neutral"}>{status?.aiAnsweringEnabled ? "Pornit" : "Oprit"}</Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {status?.aiAnsweringEnabled
              ? "Apelanții autorizați pot fi selectați pentru AI. Nicio linie telefonică nu este conectată."
              : "Apelurile noi nu vor fi preluate de AI."}
          </p>
        </button>
        <div className="flex items-center justify-between gap-2 px-1">
          <div>
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-[var(--muted)]">{user?.email}</p>
          </div>
          <button
            type="button"
            aria-label="Deconectare"
            className="rounded-xl border border-[var(--line)] p-2"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--sidebar)_1fr]">
      <aside className="hidden border-r border-[var(--line)] bg-[var(--surface)] px-4 py-5 lg:block">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-[min(100%,320px)] overflow-y-auto bg-[var(--surface)] p-4" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="mb-4 rounded-xl border border-[var(--line)] p-2" onClick={() => setOpen(false)} aria-label="Închide meniul">
              <X size={16} />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 py-3 backdrop-blur">
          <button type="button" className="rounded-xl border border-[var(--line)] p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Deschide meniul">
            <Menu size={18} />
          </button>
          <div className="mr-auto flex flex-wrap items-center gap-2">
            <Badge tone="good">{connectionText(status)}</Badge>
            <Badge>Asterisk {statusLabel(status?.asterisk?.state || "checking")}</Badge>
            <Badge>AI {status?.ai?.llm?.configured ? "date de acces prezente" : "neconfigurat"}</Badge>
            {status?.developmentMode ? <Badge tone="warn">Mod de dezvoltare</Badge> : null}
          </div>
          <Link href="/notifications" className="relative rounded-xl border border-[var(--line)] p-2" aria-label="Notificări">
            <Bell size={18} />
            {unread > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--button)] px-1 text-[10px] text-white">{unread}</span> : null}
          </Link>
          <button type="button" className="rounded-xl border border-[var(--line)] p-2" onClick={toggleTheme} aria-label="Schimbă tema" suppressHydrationWarning>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="hidden items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm sm:flex">
            <Shield size={16} />
            <span>{user?.name}</span>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          {error ? <p className="mb-4 text-sm text-[var(--bad)]">{error}</p> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
