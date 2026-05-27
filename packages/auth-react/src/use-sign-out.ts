"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "reactfire";
import { signOut as firebaseSignOut } from "firebase/auth";

// Full sign-out: clears the Privy session as well as Firebase, and does NOT
// redirect (the caller owns the post-sign-out UI). The shared
// useGraffiticodeAuth().signOut clears only Firebase and hard-redirects to "/".
export function useSignOut() {
  const { logout } = usePrivy();
  const auth = useAuth();
  return useCallback(async () => {
    try {
      await logout();
    } catch {
      // Privy may already be logged out; ignore.
    }
    await firebaseSignOut(auth);
  }, [logout, auth]);
}
