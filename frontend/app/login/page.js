"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { Button, Field, TextInput } from "../../components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();
  const [mode, setMode] = useState("login");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "Alin", email: "", password: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  useEffect(() => {
    api("/api/v1/auth/registration")
      .then((result) => {
        setOpen(result.data.open);
        if (result.data.open) setMode("register");
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const path = mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";
      await api(path, {
        method: "POST",
        body: {
          email: form.email,
          password: form.password,
          name: form.name,
          client: "web",
        },
      });
      await refresh();
      router.replace("/dashboard");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="panel w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--button)] font-semibold text-white">ODY</div>
          <div>
            <h1 className="font-display text-2xl font-semibold">ODY Phone AI</h1>
            <p className="text-sm text-[var(--muted)]">Panoul proprietarului</p>
          </div>
        </div>
        <p className="mb-5 text-sm leading-6 text-[var(--muted)]">
          Acest cont controlează contactele, regulile de apel și comutatorul de răspuns AI. Nu conectează singur o linie telefonică.
        </p>
        <form className="space-y-4" onSubmit={submit}>
          {mode === "register" ? (
            <Field label="Nume">
              <TextInput name="name" value={form.name} onChange={update} required />
            </Field>
          ) : null}
          <Field label="Email">
            <TextInput name="email" type="email" autoComplete="username" value={form.email} onChange={update} required />
          </Field>
          <Field label="Parolă" hint="Cel puțin 10 caractere.">
            <TextInput name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={form.password} onChange={update} required minLength={mode === "register" ? 10 : 1} />
          </Field>
          {error ? <p className="text-sm text-[var(--bad)]">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Așteaptă…" : mode === "register" ? "Creează contul de proprietar" : "Autentificare"}
          </Button>
        </form>
        {open && mode === "login" ? (
          <button type="button" className="mt-4 text-sm text-[var(--accent)]" onClick={() => setMode("register")}>Creează contul de proprietar</button>
        ) : null}
        {mode === "register" ? (
          <button type="button" className="mt-4 text-sm text-[var(--accent)]" onClick={() => setMode("login")}>Am deja un cont</button>
        ) : null}
      </div>
    </div>
  );
}
