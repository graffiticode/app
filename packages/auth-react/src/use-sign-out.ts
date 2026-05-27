"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "reactfire";
import { signOut as firebaseSignOut } from "firebase/auth";
import { clearSsoSession } from "./sso-client";

// Full sign-out: clears the Privy session and the shared SSO cookie as well as
// Firebase, and does NOT redirect (the caller owns the post-sign-out UI). The
// shared useGraffiticodeAuth().signOut clears the SSO cookie + Firebase and
// hard-redirects to "/".
export function useSignOut() {
  const { logout } = usePrivy();
  const auth = useAuth();
  return useCallback(async () => {
    try {
      await logout();
    } catch {
      // Privy may already be logged out; ignore.
    }
    await clearSsoSession();
    await firebaseSignOut(auth);
  }, [logout, auth]);
}
