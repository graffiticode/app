"use client";

// Client-side SSO helpers. These talk to the hosting app's own /api/sso/*
// routes (relative URLs), which set/read the HttpOnly refresh-token cookie that
// is shared across *.graffiticode.org. All are best-effort: SSO must never
// block or break a normal sign-in/out, so failures are logged and swallowed.

// Per-origin marker that this browser established its current session while SSO
// was active. The single-sign-out watcher only acts when this is set, so it
// never logs out a legacy session that predates SSO (those never set the flag).
const SSO_ACTIVE_KEY = "graffiticode:sso:active";

// Timestamp of the last cookie write, used to avoid racing a fresh sign-in: the
// watcher skips its check briefly after we (re)write the cookie.
let lastSsoWriteAt = 0;

function markSsoActive(): void {
  lastSsoWriteAt = Date.now();
  try {
    if (typeof window !== "undefined") localStorage.setItem(SSO_ACTIVE_KEY, "1");
  } catch {
    // localStorage unavailable (private mode / SSR) — non-fatal.
  }
}

function clearSsoActive(): void {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(SSO_ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export function isSsoActive(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(SSO_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function recentlyWroteSso(windowMs = 8000): boolean {
  return Date.now() - lastSsoWriteAt < windowMs;
}

// Marks the local session as SSO-backed without writing a cookie. Called after a
// successful bootstrap sign-in (the cookie already exists in that case).
export function noteSsoBootstrapped(): void {
  markSsoActive();
}

// Stores the refresh token in the shared SSO cookie after a successful sign-in.
export async function setSsoSession(refreshToken: string | undefined | null): Promise<void> {
  if (!refreshToken) return;
  try {
    await fetch("/api/sso/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    markSsoActive();
  } catch (err) {
    console.error("[sso] setSsoSession failed", err);
  }
}

// Clears the shared SSO cookie on sign-out (→ single sign-out across apps).
export async function clearSsoSession(): Promise<void> {
  clearSsoActive();
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

// Cheaply reports whether the shared SSO cookie is still present (no token
// exchange). Fails safe to `true` so a transient error never triggers an
// unwanted sign-out.
export async function ssoSessionPresent(): Promise<boolean> {
  try {
    const res = await fetch("/api/sso/status", { method: "GET" });
    if (!res.ok) return true;
    const body = await res.json().catch(() => null);
    return body?.present !== false;
  } catch (err) {
    console.error("[sso] ssoSessionPresent failed", err);
    return true;
  }
}
