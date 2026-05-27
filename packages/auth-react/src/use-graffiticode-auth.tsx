"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import useSWR from "swr";
import { useSignInWithEthereum } from "./use-ethereum";
import { useAuth, useUser } from "reactfire";
import { signInWithCustomToken, signOut } from "firebase/auth";
import {
  setSsoSession,
  clearSsoSession,
  bootstrapSsoSession,
  ssoSessionPresent,
  isSsoActive,
  recentlyWroteSso,
  noteSsoBootstrapped,
} from "./sso-client";

type PendingEthereumSignup = {
  needsSignupConfirm: true;
  address: string;
  accountAddress: string;
};

export type GraffiticodeUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  getToken: () => Promise<string>;
};

const GraffiticodeAuthContext = createContext({
  loading: true,
  user: null as GraffiticodeUser | null,
  signInWithEthereum: async (_selectedWallet?: any): Promise<any> => {},
  beginEthereumSignIn: async (
    _selectedWallet?: any,
  ): Promise<PendingEthereumSignup | undefined> => undefined,
  confirmEthereumSignIn: async (_pending: PendingEthereumSignup): Promise<void> => {},
  signOut: () => {},
});

export function GraffiticodeAuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { status: firebaseUserStatus, data: firebaseUser } = useUser();
  const {
    signInWithEthereum: siwe,
    connectAndCheck,
    signInForAddress,
  } = useSignInWithEthereum();

  const signInWithEthereum = useCallback(
    async (selectedWallet?: any) => {
      if (firebaseUser) {
        console.warn(`User ${firebaseUser.uid} is already signed in`);
        return auth;
      }
      const { firebaseCustomToken, refresh_token } = await siwe(selectedWallet);
      await signInWithCustomToken(auth, firebaseCustomToken);
      await setSsoSession(refresh_token);
    },
    [firebaseUser, siwe, auth],
  );

  const beginEthereumSignIn = useCallback(
    async (selectedWallet?: any): Promise<PendingEthereumSignup | undefined> => {
      if (firebaseUser) {
        console.warn(`User ${firebaseUser.uid} is already signed in`);
        return undefined;
      }
      const { accountAddress, address, exists } = await connectAndCheck(selectedWallet);
      if (exists) {
        const { firebaseCustomToken, refresh_token } = await signInForAddress(address, accountAddress);
        await signInWithCustomToken(auth, firebaseCustomToken);
        await setSsoSession(refresh_token);
        return undefined;
      }
      return { needsSignupConfirm: true, address, accountAddress };
    },
    [firebaseUser, auth, connectAndCheck, signInForAddress],
  );

  const confirmEthereumSignIn = useCallback(
    async (pending: PendingEthereumSignup) => {
      const { firebaseCustomToken, refresh_token } = await signInForAddress(pending.address, pending.accountAddress);
      await signInWithCustomToken(auth, firebaseCustomToken);
      await setSsoSession(refresh_token);
    },
    [auth, signInForAddress],
  );

  let user: GraffiticodeUser | null = null;
  if (firebaseUser) {
    user = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      getToken: () => firebaseUser.getIdToken(),
    };
  }

  // Cross-app SSO bootstrap: when Firebase resolves with no session, try to
  // exchange the shared .graffiticode.org refresh-token cookie for a Firebase
  // custom token (set by a prior sign-in on a sibling app). We hold rendering
  // until this attempt finishes so a momentarily-signed-out user doesn't see a
  // sign-in flash before the silent sign-in lands.
  const [bootstrapPhase, setBootstrapPhase] = useState<"pending" | "running" | "done">("pending");
  useEffect(() => {
    if (firebaseUserStatus === "loading") return;
    if (firebaseUser) {
      if (bootstrapPhase !== "done") setBootstrapPhase("done");
      return;
    }
    if (bootstrapPhase !== "pending") return;
    setBootstrapPhase("running");
    (async () => {
      const token = await bootstrapSsoSession();
      if (token) {
        try {
          await signInWithCustomToken(auth, token);
          noteSsoBootstrapped();
        } catch (err) {
          console.error("[sso] bootstrap sign-in failed", err);
        }
      }
      setBootstrapPhase("done");
    })();
  }, [firebaseUserStatus, firebaseUser, bootstrapPhase, auth]);

  // Single sign-out: if this browser has an SSO-backed session but the shared
  // .graffiticode.org cookie is gone (the user signed out on a sibling app),
  // drop the local Firebase session too. Runs on load and when the tab regains
  // focus/visibility. Skipped right after a fresh cookie write (avoids racing a
  // sign-in) and for sessions that never went through SSO (legacy sessions).
  useEffect(() => {
    if (!firebaseUser) return;
    let cancelled = false;
    const check = async () => {
      if (!isSsoActive() || recentlyWroteSso()) return;
      const present = await ssoSessionPresent();
      if (!cancelled && !present) {
        clearSsoSession();
        try {
          await signOut(auth);
        } catch (err) {
          console.error("[sso] remote sign-out failed", err);
        }
      }
    };
    check();
    const onFocus = () => check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [firebaseUser, auth]);

  const ready = firebaseUserStatus !== "loading" && (firebaseUser != null || bootstrapPhase === "done");

  const handleSignOut = useCallback(async () => {
    await clearSsoSession();
    await signOut(auth);
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, [auth]);

  const value = {
    loading: !ready,
    user,
    signInWithEthereum,
    beginEthereumSignIn,
    confirmEthereumSignIn,
    signOut: handleSignOut,
  };

  return (
    <GraffiticodeAuthContext.Provider value={value}>
      {ready && children}
    </GraffiticodeAuthContext.Provider>
  );
}

export default function useGraffiticodeAuth() {
  return useContext(GraffiticodeAuthContext);
}

export function useToken() {
  const { user } = useGraffiticodeAuth();
  return useSWR(
    user ? { user } : null,
    async ({ user }) => {
      const token = await user.getToken();
      return token;
    },
    {
      refreshInterval: 3 * 60 * 1000,
    },
  );
}
