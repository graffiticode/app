"use client";

// Client-side SSO helpers. These talk to the hosting app's own /api/sso/*
// routes (relative URLs), which set/read the HttpOnly refresh-token cookie that
// is shared across *.graffiticode.org. All are best-effort: SSO must never
// block or break a normal sign-in/out, so failures are logged and swallowed.

// Stores the refresh token in the shared SSO cookie after a successful sign-in.
export async function setSsoSession(refreshToken: string | undefined | null): Promise<void> {
  if (!refreshToken) return;
  try {
    await fetch("/api/sso/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err) {
    console.error("[sso] setSsoSession failed", err);
  }
}

// Clears the shared SSO cookie on sign-out (→ single sign-out across apps).
export async function clearSsoSession(): Promise<void> {
  try {
    await fetch("/api/sso/session", { method: "DELETE" });
  } catch (err) {
    console.error("[sso] clearSsoSession failed", err);
  }
}

// Asks the hosting app to exchange the shared SSO cookie for a Firebase custom
// token. Returns the token (to pass to signInWithCustomToken) or null when
// there's no usable session.
export async function bootstrapSsoSession(): Promise<string | null> {
  try {
    const res = await fetch("/api/sso/bootstrap", { method: "GET" });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const token = body?.firebaseCustomToken;
    return typeof token === "string" && token ? token : null;
  } catch (err) {
    console.error("[sso] bootstrapSsoSession failed", err);
    return null;
  }
}
