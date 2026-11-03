"use client";

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: "bg-[var(--button)] text-[var(--button-text)] hover:brightness-110",
    quiet: "border border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--accent)]",
    danger: "bg-[var(--bad)] text-white hover:brightness-110",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-[var(--muted)]">{hint}</span> : null}
      {error ? <span className="block text-xs text-[var(--bad)]">{error}</span> : null}
    </label>
  );
}

export function TextInput({ className = "", ...props }) {
  return <input className={`field ${className}`} {...props} />;
}

export function TextArea(props) {
  return <textarea className="field min-h-28 resize-y" {...props} />;
}

export function Select({ className = "", ...props }) {
  return <select className={`field ${className}`} {...props} />;
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-left text-sm disabled:opacity-60"
    >
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-[var(--button)]" : "bg-[var(--line)]"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-5" : "left-0.5"}`} />
      </span>
      <span>{label}</span>
    </button>
  );
}

export function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-[var(--surface-2)] text-[var(--muted)]",
    good: "bg-emerald-500/15 text-[var(--good)]",
    warn: "bg-amber-500/15 text-[var(--warn)]",
    bad: "bg-red-500/15 text-[var(--bad)]",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Banner({ children, tone = "neutral" }) {
  return <div className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm ${tone === "bad" ? "text-[var(--bad)]" : ""}`}>{children}</div>;
}

export function EmptyState({ icon, title, body }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-5 py-8">
      <div className="text-[var(--accent)]">{icon}</div>
      <div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted)]">{body}</p>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">{eyebrow}</p> : null}
        <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="panel max-h-[90vh] w-full max-w-xl overflow-y-auto p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button type="button" className="text-sm text-[var(--muted)]" onClick={onClose}>Închide</button>
        </div>
        {children}
      </div>
    </div>
  );
}
