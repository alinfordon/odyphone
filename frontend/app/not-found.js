import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="panel max-w-md p-6">
        <h1 className="font-display text-2xl font-semibold">Pagina nu a fost găsită</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Acest ecran nu face parte din ODY Phone AI.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-[var(--accent)]">Înapoi la privire de ansamblu</Link>
      </div>
    </div>
  );
}
