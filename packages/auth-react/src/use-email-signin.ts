"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useLoginWithEmail,
  useWallets,
  usePrivy,
  useCreateWallet,
  useSignMessage,
  getEmbeddedConnectedWallet,
  type ConnectedWallet,
  type User as PrivyUser,
} from "@privy-io/react-auth";
import { useAuth } from "reactfire";
import { signInWithCustomToken } from "firebase/auth";
import { stripHexPrefix } from "@ethereumjs/util";
import { client } from "./auth-client";
import { setSsoSession } from "./sso-client";

const LOGIN_COMPLETE_TIMEOUT_MS = 30_000;
const CONNECTED_WALLET_TIMEOUT_MS = 20_000;
const POLL_MS = 150;

type LoginCompleteWaiter = {
  resolve: (user: PrivyUser) => void;
  reject: (err: Error) => void;
};

interface UseEmailSignInOptions {
  allowSignup?: boolean;
}

type ResolveResponse =
  | { matched: true; customToken: string }
  | { matched: false; email?: string };

export function useEmailSignIn(options: UseEmailSignInOptions = {}) {
  const { allowSignup = false } = options;
  const auth = useAuth();
  const { logout, user, getAccessToken } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { wallets } = useWallets();
  const { signMessage: privySignMessage } = useSignMessage();

  const loginCompleteWaiterRef = useRef<LoginCompleteWaiter | null>(null);
  const { sendCode: privySendCode, loginWithCode: privyLoginWithCode } = useLoginWithEmail({
    onComplete: (privyUser) => {
      loginCompleteWaiterRef.current?.resolve(privyUser as unknown as PrivyUser);
      loginCompleteWaiterRef.current = null;
    },
    onError: (err) => {
      const msg = typeof err === "string" ? err : "Privy login failed";
      loginCompleteWaiterRef.current?.reject(new Error(msg));
      loginCompleteWaiterRef.current = null;
    },
  });

  const walletsRef = useRef(wallets);
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pendingSignupEmail, setPendingSignupEmail] = useState<string | null>(null);
  const awaitingSignupConfirm = pendingSignupEmail !== null;

  const sendCode = useCallback(
    async (email: string) => {
      setSending(true);
      setEmailError(null);
      try {
        try {
          await logout();
        } catch {
          // ignore — clean-slate is best-effort
        }
        await privySendCode({ email });
        setPendingEmail(email);
      } catch (err: any) {
        const msg = err?.message || "Failed to send code";
        setEmailError(msg);
        throw err;
      } finally {
        setSending(false);
      }
    },
    [privySendCode, logout],
  );

  const armLoginCompleteWaiter = useCallback((): Promise<PrivyUser> => {
    return new Promise((resolve, reject) => {
      loginCompleteWaiterRef.current = { resolve, reject };
      setTimeout(() => {
        if (loginCompleteWaiterRef.current) {
          loginCompleteWaiterRef.current = null;
          reject(new Error("Timed out waiting for Privy login to complete."));
        }
      }, LOGIN_COMPLETE_TIMEOUT_MS);
    });
  }, []);

  const waitForConnectedWallet = useCallback(
    async (address: string): Promise<ConnectedWallet | null> => {
      const target = address.toLowerCase();
      const start = Date.now();
      while (Date.now() - start < CONNECTED_WALLET_TIMEOUT_MS) {
        const list = walletsRef.current;
        const match = list.find(
          (w) => w.walletClientType === "privy" && w.address.toLowerCase() === target,
        );
        if (match) return match;
        const fallback = getEmbeddedConnectedWallet(list);
        if (fallback) return fallback;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      return null;
    },
    [],
  );

  const createEmbeddedWallet = useCallback(async (): Promise<ConnectedWallet> => {
    let address = userRef.current?.wallet?.address;
    if (!address) {
      try {
        const created = await createWallet();
        address = created.address;
      } catch (err: any) {
        if (!/already.*wallet/i.test(err?.message || "")) {
          throw new Error(err?.message || "Failed to create embedded wallet");
        }
        address = userRef.current?.wallet?.address;
      }
    }
    if (!address) {
      throw new Error("Embedded wallet address unavailable after creation.");
    }
    const connected = await waitForConnectedWallet(address);
    if (!connected) {
      throw new Error("Embedded wallet did not connect. Please try again.");
    }
    return connected;
  }, [createWallet, waitForConnectedWallet]);

  const persistSignInEmail = useCallback(
    async (uid: string, idToken: string, email: string) => {
      try {
        const getResp = await fetch(`/api/user/${uid}`, {
          headers: { Authorization: idToken },
        });
        let alreadySet = false;
        if (getResp.ok) {
          const userData = await getResp.json();
          alreadySet = !!userData?.signInEmail;
        }
        if (alreadySet) return;
        await fetch(`/api/user/${uid}`, {
          method: "PUT",
          headers: {
            Authorization: idToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signInEmail: email,
            signInEmailVerifiedAt: new Date().toISOString(),
          }),
        });
      } catch (err) {
        console.error("Failed to persist signInEmail:", err);
      }
    },
    [],
  );

  const resolveEmail = useCallback(async (privyAccessToken: string): Promise<ResolveResponse> => {
    const res = await fetch("/api/email-signin/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privyAccessToken }),
    });
    if (!res.ok) {
      return { matched: false };
    }
    return res.json();
  }, []);

  const createAccountFromCurrentPrivySession = useCallback(
    async (email: string) => {
      const wallet = await createEmbeddedWallet();
      const accountAddress = wallet.address;
      const address = stripHexPrefix(accountAddress);
      const nonce = await client.ethereum.getNonce({ address });
      const sigRaw = await privySignMessage(
        `Nonce: ${nonce}`,
        { showWalletUIs: false },
        accountAddress,
      );
      const signature = stripHexPrefix(sigRaw);
      const { firebaseCustomToken, refresh_token } = await client.ethereum.authenticate({
        address,
        nonce,
        signature,
      });
      const credential = await signInWithCustomToken(auth, firebaseCustomToken);
      const uid = credential.user.uid;
      const idToken = await credential.user.getIdToken();
      await persistSignInEmail(uid, idToken, email);
      await setSsoSession(refresh_token);

      try {
        await logout();
      } catch {
        // Privy session no longer needed once Firebase has taken over.
      }
    },
    [auth, createEmbeddedWallet, privySignMessage, persistSignInEmail, logout],
  );

  const verifyAndSignIn = useCallback(
    async (code: string): Promise<"signed-in" | "needs-confirm"> => {
      setVerifying(true);
      setCodeError(null);
      try {
        const loginCompletePromise = armLoginCompleteWaiter();
        await privyLoginWithCode({ code });
        await loginCompletePromise;

        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Privy access token unavailable.");
        }
        const resolved = await resolveEmail(accessToken);

        if (resolved.matched === true) {
          await signInWithCustomToken(auth, resolved.customToken);
          try {
            await logout();
          } catch {
            // ignore
          }
          return "signed-in";
        }

        const resolvedEmail: string | undefined =
          resolved.matched === false ? resolved.email : undefined;
        const email = pendingEmail || resolvedEmail || "";
        if (!allowSignup) {
          setPendingSignupEmail(email);
          return "needs-confirm";
        }

        await createAccountFromCurrentPrivySession(email);
        return "signed-in";
      } catch (err: any) {
        const msg = err?.message || "Failed to verify code";
        setCodeError(msg);
        throw err;
      } finally {
        setVerifying(false);
      }
    },
    [
      allowSignup,
      armLoginCompleteWaiter,
      privyLoginWithCode,
      getAccessToken,
      resolveEmail,
      auth,
      logout,
      pendingEmail,
      createAccountFromCurrentPrivySession,
    ],
  );

  const confirmAndCreateAccount = useCallback(async () => {
    if (!pendingSignupEmail) {
      setCodeError("Sign-up session expired. Please try again.");
      return;
    }
    setVerifying(true);
    setCodeError(null);
    try {
      await createAccountFromCurrentPrivySession(pendingSignupEmail);
      setPendingSignupEmail(null);
    } catch (err: any) {
      const msg = err?.message || "Failed to create account";
      setCodeError(msg);
      throw err;
    } finally {
      setVerifying(false);
    }
  }, [pendingSignupEmail, createAccountFromCurrentPrivySession]);

  const cancelSignup = useCallback(async () => {
    setPendingSignupEmail(null);
    try {
      await logout();
    } catch {
      // ignore
    }
  }, [logout]);

  const reset = useCallback(() => {
    setPendingEmail(null);
    setEmailError(null);
    setCodeError(null);
    setSending(false);
    setVerifying(false);
    setPendingSignupEmail(null);
  }, []);

  return {
    sendCode,
    verifyAndSignIn,
    confirmAndCreateAccount,
    cancelSignup,
    reset,
    pendingEmail,
    sending,
    verifying,
    emailError,
    codeError,
    awaitingSignupConfirm,
  };
}
