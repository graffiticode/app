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
const PRIVY_READY_TIMEOUT_MS = 15_000;
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
  // `ready`/`authenticated` matter: Privy's own signMessage refuses with
  // "User must be authenticated before signing with a Privy wallet" when its
  // in-memory session isn't settled, which is not something onComplete guarantees.
  const { logout, user, getAccessToken, ready, authenticated } = usePrivy();
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

  // These refs are updated by an effect, i.e. one render AFTER the value changes.
  // Nothing inside a single promise chain may treat them as current — see
  // createEmbeddedWallet. They are only safe to read from a polling loop, which
  // yields long enough for React to re-render.
  const walletsRef = useRef(wallets);
  useEffect(() => {
    walletsRef.current = wallets;
  }, [wallets]);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const readyRef = useRef(ready);
  const authenticatedRef = useRef(authenticated);
  useEffect(() => {
    readyRef.current = ready;
    authenticatedRef.current = authenticated;
  }, [ready, authenticated]);

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
        const match = walletsRef.current.find(
          (w) => w.walletClientType === "privy" && w.address.toLowerCase() === target,
        );
        if (match) return match;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      return null;
    },
    [],
  );

  // Only for the case where we know a wallet exists but not which address.
  // Never used when we have a target: signing the WRONG embedded wallet yields a
  // different SIWE address and therefore a different Firebase uid.
  const waitForAnyEmbeddedWallet = useCallback(async (): Promise<ConnectedWallet | null> => {
    const start = Date.now();
    while (Date.now() - start < CONNECTED_WALLET_TIMEOUT_MS) {
      const found = getEmbeddedConnectedWallet(walletsRef.current);
      if (found) return found;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return null;
  }, []);

  /**
   * Privy's session must be settled before we ask it to sign. All THREE conditions
   * matter, and the user object is the one that actually bites: Privy's signMessage
   * guards on `!authenticated || !user` and reports either as
   * "User must be authenticated before signing with a Privy wallet". `authenticated`
   * flips as soon as a token exists, while `user` is populated by a later fetch — so
   * waiting only on `authenticated` returns during that window and signing fails with
   * a message that blames auth when the session is fine.
   *
   * Polls rather than reading once, because the refs lag by a render.
   */
  const waitForPrivyReady = useCallback(async (): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < PRIVY_READY_TIMEOUT_MS) {
      if (readyRef.current && authenticatedRef.current && userRef.current) return;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw new Error(
      "Privy session did not finish loading. Please request a new code and try again.",
    );
  }, []);

  /**
   * The account's embedded wallet, or undefined if it genuinely has none.
   *
   * Deliberately reads `linkedAccounts` rather than the `wallet` convenience field:
   * a user may hold SEVERAL embedded wallets (every failed sign-up used to mint
   * another), and which one we sign with decides the SIWE address and therefore the
   * uid. Earliest-linked wins so repeat sign-ins converge on one account instead of
   * drifting to a new one.
   */
  const embeddedWalletAddress = useCallback((u: PrivyUser | null | undefined): string | undefined => {
    if (!u) return undefined;
    const linked: any[] = Array.isArray((u as any).linkedAccounts) ? (u as any).linkedAccounts : [];
    const embedded = linked.filter(
      (a) => a?.type === "wallet" && a?.walletClientType === "privy" && typeof a?.address === "string",
    );
    if (embedded.length === 0) return (u as any).wallet?.address;
    const at = (a: any) => {
      const t = a?.firstVerifiedAt ?? a?.latestVerifiedAt;
      const ms = t instanceof Date ? t.getTime() : typeof t === "number" ? t : NaN;
      return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
    };
    return [...embedded].sort((a, b) => at(a) - at(b))[0].address;
  }, []);

  /**
   * `privyUser` is the authoritative object Privy handed us via onComplete. It MUST
   * be passed in: `userRef.current` is updated by an effect and so is still the
   * pre-login value (null — sendCode logs out first) for the whole of this promise
   * chain. Reading the stale ref made this mint a brand-new embedded wallet on every
   * attempt, which both broke signing and silently moved the user's uid.
   */
  const createEmbeddedWallet = useCallback(
    async (privyUser: PrivyUser | null): Promise<ConnectedWallet> => {
      let address = embeddedWalletAddress(privyUser);
      let created = false;
      if (!address) {
        try {
          address = (await createWallet()).address;
          created = true;
        } catch (err: any) {
          if (!/already.*wallet/i.test(err?.message || "")) {
            throw new Error(err?.message || "Failed to create embedded wallet");
          }
          // Privy says one already exists but the object we were handed didn't list
          // it. Don't create a second — find the existing one.
          const existing = await waitForAnyEmbeddedWallet();
          if (!existing) {
            throw new Error("Embedded wallet address unavailable. Please request a new code.");
          }
          return existing;
        }
      }
      const connected = await waitForConnectedWallet(address!);
      if (!connected) {
        throw new Error(
          created
            ? "Embedded wallet did not connect. Please request a new code."
            : "Embedded wallet did not connect. Please try again.",
        );
      }
      return connected;
    },
    [createWallet, waitForConnectedWallet, waitForAnyEmbeddedWallet, embeddedWalletAddress],
  );

  /**
   * Register the sign-up address as a linked email.
   *
   * Without this the address exists ONLY as `signInEmail` on the user doc, while
   * `/api/email-signin/resolve` matches solely against the auth service's
   * linked-emails store — so every later sign-in reported "no such account" and
   * re-prompted the user to create one they already had. It also left the address
   * invisible in Settings while still functioning as a credential.
   *
   * Best-effort: the account already exists by this point, so a failure here must
   * not fail the sign-up. 409 means it is already linked (a re-run) — not an error.
   */
  const registerLinkedEmail = useCallback(
    async (idToken: string) => {
      try {
        const privyAccessToken = await getAccessToken();
        if (!privyAccessToken) return;
        const res = await fetch("/api/linked-emails/add", {
          method: "POST",
          headers: { Authorization: idToken, "Content-Type": "application/json" },
          body: JSON.stringify({ privyAccessToken }),
        });
        if (!res.ok && res.status !== 409) {
          console.error("Failed to register linked email:", res.status);
        }
      } catch (err) {
        console.error("Failed to register linked email:", err);
      }
    },
    [getAccessToken],
  );

  const persistSignInEmailDoc = useCallback(
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

  // One fact, two records — written together so they cannot diverge. `signInEmail`
  // on the user doc is what Profile displays; the linked-emails row is what every
  // later sign-in resolves against.
  const recordSignInIdentity = useCallback(
    async (uid: string, idToken: string, email: string) => {
      await Promise.all([
        persistSignInEmailDoc(uid, idToken, email),
        registerLinkedEmail(idToken),
      ]);
    },
    [persistSignInEmailDoc, registerLinkedEmail],
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
    async (email: string, privyUser: PrivyUser | null) => {
      // Before touching wallets: a null SDK user breaks wallet selection the same
      // way it breaks signing, and once it has loaded userRef is a usable fallback
      // for the object onComplete handed us.
      await waitForPrivyReady();
      const wallet = await createEmbeddedWallet(privyUser ?? userRef.current);
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
      // Before logout(): registering the linked email needs the Privy access token.
      await recordSignInIdentity(uid, idToken, email);
      await setSsoSession(refresh_token);

      try {
        await logout();
      } catch {
        // Privy session no longer needed once Firebase has taken over.
      }
    },
    [auth, createEmbeddedWallet, waitForPrivyReady, privySignMessage, recordSignInIdentity, logout],
  );

  const verifyAndSignIn = useCallback(
    async (code: string): Promise<"signed-in" | "needs-confirm"> => {
      setVerifying(true);
      setCodeError(null);
      // Once loginWithCode resolves the code is SPENT: any later failure cannot be
      // retried with the same code, so the error must say to request a new one.
      let codeConsumed = false;
      try {
        const loginCompletePromise = armLoginCompleteWaiter();
        await privyLoginWithCode({ code });
        // Keep this user. It is the only current view of the Privy session inside
        // this promise chain — userRef is an effect behind and still holds the
        // pre-login value.
        const privyUser = await loginCompletePromise;
        codeConsumed = true;

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

        await createAccountFromCurrentPrivySession(email, privyUser);
        return "signed-in";
      } catch (err: any) {
        // Log as well as display: swallowing this silently is why a live failure
        // produced an empty browser console and had to be diagnosed by hand.
        console.error("Email sign-in failed:", err);
        const msg = err?.message || "Failed to verify code";
        setCodeError(
          codeConsumed && !/new code/i.test(msg)
            ? `${msg} That code has been used — request a new one.`
            : msg,
        );
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
      // Safe to read the ref here, unlike inside verifyAndSignIn's chain: this runs
      // from a later user interaction, so the effect has long since caught up.
      await createAccountFromCurrentPrivySession(pendingSignupEmail, userRef.current);
      setPendingSignupEmail(null);
    } catch (err: any) {
      console.error("Account creation failed:", err);
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
