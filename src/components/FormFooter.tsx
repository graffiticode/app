import { MCP_ENDPOINT, QUICKSTART_URL } from "@/lib/attribution";

// Slim attribution bar shown below every /form artifact view (free-plan and
// authenticated alike). It attributes the render host — not the rendered output
// itself, which stays unwatermarked — and points a human viewer back to the
// canonical MCP entry so silent usage can convert into an identified developer.
export function FormFooter() {
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-3 text-xs text-gray-500">
      <span className="truncate">
        Made with{" "}
        <span className="font-semibold text-gray-700">Graffiticode</span>
        <span className="hidden sm:inline"> · </span>
        <a
          href={MCP_ENDPOINT}
          target="_blank"
          rel="noreferrer"
          className="hidden font-mono text-blue-600 hover:underline sm:inline"
        >
          mcp.graffiticode.org/mcp
        </a>
      </span>
      <a
        href={QUICKSTART_URL}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 whitespace-nowrap text-blue-600 hover:underline"
      >
        Create your own →
      </a>
    </footer>
  );
}
