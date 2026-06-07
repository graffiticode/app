import type { Metadata } from "next";

// Per-item artifact pages (/form and /form/<id>) should not be search-indexed —
// they render user-created items, not funnel/landing content. The host root (/)
// stays indexable so it remains a discoverable high-signal entry point.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function FormLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
