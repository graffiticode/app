"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGraffiticodeAuth } from "@graffiticode/auth-react";
import { FormHarness } from "@/components/FormHarness";
import { RequestAccess } from "@/components/RequestAccess";
import { SignIn } from "@/components/SignIn";

type Owner = { uid?: string; email?: string } | null;

type State =
  | { status: "loading" }
  | { status: "allowed"; taskId: string; itemId: string | null; accessToken: string | null }
  | { status: "denied"; reason: "locked" | "not-found"; owner: Owner }
  | { status: "error" };

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {children}
    </main>
  );
}

export default function FormByIdPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { user, loading } = useGraffiticodeAuth();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (loading || !id) return;
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      const token = user ? await user.getToken() : null;
      const res = await fetch(`/api/form/resolve?id=${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: token } : {},
      });
      if (cancelled) return;
      const body = await res.json();
      if (body.allowed) {
        setState({ status: "allowed", taskId: body.taskId, itemId: body.itemId ?? null, accessToken: token });
      } else {
        setState({ status: "denied", reason: body.reason, owner: body.owner });
      }
    })().catch((err) => {
      console.error("form resolve failed", err);
      if (!cancelled) setState({ status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [id, user, loading]);

  if (loading || state.status === "loading") {
    return (
      <FullScreen>
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900" />
      </FullScreen>
    );
  }

  if (state.status === "allowed") {
    return <FormHarness taskId={state.taskId} itemId={state.itemId} accessToken={state.accessToken} />;
  }

  if (state.status === "denied") {
    // A private item or task can't be resolved without credentials — if the
    // viewer isn't signed in, prompt sign-in (which re-resolves on success)
    // rather than declaring it missing or locked.
    if (!user) {
      return (
        <FullScreen>
          <h1 className="text-xl font-semibold">Sign in to view this form</h1>
          <p className="max-w-md text-gray-600">
            This form isn&apos;t public. Sign in to open it.
          </p>
          <SignIn label="Sign in" className="rounded bg-gray-900 px-4 py-2 text-white" />
        </FullScreen>
      );
    }
    if (state.reason === "not-found") {
      return (
        <FullScreen>
          <h1 className="text-xl font-semibold">Not found</h1>
          <p className="text-gray-600">No form exists for this id.</p>
        </FullScreen>
      );
    }
    return <RequestAccess owner={state.owner} signedIn={true} />;
  }

  return (
    <FullScreen>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-gray-600">Could not load this form. Please try again.</p>
    </FullScreen>
  );
}
