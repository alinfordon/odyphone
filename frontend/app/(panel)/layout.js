"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { useAuth } from "../../components/AuthProvider";

export default function PanelLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Se încarcă contul…</div>;
  }

  return <AppShell>{children}</AppShell>;
}
