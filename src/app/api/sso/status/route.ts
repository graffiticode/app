import { NextRequest, NextResponse } from "next/server";
import { readSsoCookie } from "@graffiticode/auth-react/server";

export const runtime = "nodejs";

// GET: cheaply report whether the shared SSO cookie is present (no token
// exchange). Used by the single-sign-out watcher to detect a sign-out that
// happened on a sibling app.
export async function GET(req: NextRequest) {
  const present = !!readSsoCookie(req.headers.get("cookie"));
  return NextResponse.json({ present });
}
