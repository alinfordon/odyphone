"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [loading, user, router]);

  return <div className="grid min-h-screen place-items-center text-sm text-[var(--muted)]">Se deschide ODY Phone AI…</div>;
}
