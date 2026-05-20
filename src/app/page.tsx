import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Graffiticode</h1>
      <p className="max-w-md text-gray-600">
        Open a form at <code className="rounded bg-gray-100 px-1.5 py-0.5">/form/&lt;id&gt;</code>,
        where <code className="rounded bg-gray-100 px-1.5 py-0.5">&lt;id&gt;</code> is a task or item
        id.
      </p>
      <Link href="/form" className="text-blue-600 underline">
        Open form view
      </Link>
    </main>
  );
}
