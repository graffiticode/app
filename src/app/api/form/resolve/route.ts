import { NextRequest, NextResponse } from "next/server";
import { authFromRequest } from "@/server/request-auth";
import { resolveFormTarget, evaluateAccess } from "@/server/resolvers";

export const runtime = "nodejs";

// Resolves a /form/{id} segment to a renderable task id and decides access.
// The viewer's token (if any) is forwarded so api-store access control (public
// flag + acls + ownership) is enforced authoritatively by api.graffiticode.org.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const auth = await authFromRequest(req);
  const target = await resolveFormTarget({ auth, id });
  const access = await evaluateAccess({ viewerAuth: auth, taskId: target.taskId });

  console.log("[form/resolve]", {
    id,
    authed: !!auth,
    uid: auth?.uid ?? null,
    resolvedTaskId: target.taskId,
    viaItem: !!target.itemId,
    allowed: access.allowed,
    reason: access.allowed ? null : access.reason,
  });

  if (access.allowed) {
    return NextResponse.json({
      allowed: true,
      taskId: target.taskId,
      itemId: target.itemId ?? null,
    });
  }
  return NextResponse.json({
    allowed: false,
    taskId: target.taskId,
    reason: access.reason,
    owner: access.owner ?? null,
    detail: access.detail ?? null,
  });
}
