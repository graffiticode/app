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
  // Access is governed by the head task; the appended "+data" segments are the
  // viewer's own runtime state and aren't independently GET-able from /task, so
  // checking the full chain would falsely 404. The full chain is still rendered.
  const headId = target.taskId.split("+")[0];
  const access = await evaluateAccess({ viewerAuth: auth, taskId: headId });

  console.log("[form/resolve]", {
    id,
    authed: !!auth,
    uid: auth?.uid ?? null,
    resolvedTaskId: target.taskId,
    accessCheckedId: headId,
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
