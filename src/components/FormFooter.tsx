"use client";

import { useEffect, useState } from "react";
import { MCP_ABOUT, CONSOLE_URL } from "@/lib/attribution";

// Slim attribution bar shown below every /form artifact view. It attributes the
// render host — not the rendered output, which stays unwatermarked.
//
// When the artifact was opened from a free-plan view link, the MCP server embeds
// the claim token as `?claim=<jwt>` (see buildViewUrl in the mcp-server). In that
// case we offer a one-click "Claim it in Graffiticode" link for this exact item.
// With no claim token (authenticated/claimed items, or a plain link) we show no
// CTA — just the attribution. The token is read on the client and captured once,
// before FormHarness may rewrite the URL.
export function FormFooter() {
  const [claimToken, setClaimToken] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("claim");
    if (token) setClaimToken(token);
  }, []);

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-3 text-xs text-gray-500">
      <span className="truncate">
        Made with{" "}
        <span className="font-semibold text-gray-700">Graffiticode</span>
        <span className="hidden sm:inline"> · </span>
        <a
          href={MCP_ABOUT}
          target="_blank"
          rel="noreferrer"
          className="hidden font-mono text-blue-600 hover:underline sm:inline"
        >
          mcp.graffiticode.org/mcp
        </a>
      </span>
      {claimToken && (
        <a
          href={`${CONSOLE_URL}/claim?token=${encodeURIComponent(claimToken)}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 whitespace-nowrap text-blue-600 hover:underline"
        >
          Claim it in Graffiticode →
        </a>
      )}
    </footer>
  );
}
