"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_GC_API_URL || "https://api.graffiticode.org";

function buildSrc(taskId: string, lang: string | null, accessToken: string | null, origin: string) {
  const params = new URLSearchParams();
  if (lang) params.set("lang", lang);
  params.set("id", taskId);
  if (accessToken) params.set("access_token", accessToken);
  if (origin) params.set("origin", origin);
  return `${apiBase}/form?${params.toString()}`;
}

export function FormHarness({
  taskId,
  lang = null,
  accessToken,
}: {
  taskId: string;
  lang?: string | null;
  accessToken: string | null;
}) {
  const [src, setSrc] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // The currently-chained task id. Runtime state changes mint a new data task
  // and advance this ref + the URL bar, without reloading the iframe (which
  // would discard the live form state).
  const currentTaskIdRef = useRef(taskId);
  const creatingRef = useRef(false);
  const lastStateHashRef = useRef<string | null>(null);

  useEffect(() => {
    currentTaskIdRef.current = taskId;
  }, [taskId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSrc(buildSrc(taskId, lang, accessToken, window.location.origin));
    setIsLoading(true);
  }, [taskId, lang, accessToken]);

  const createDataTask = useCallback(
    async (data: any) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      try {
        const res = await fetch("/api/data-task", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: accessToken } : {}),
          },
          body: JSON.stringify({ id: currentTaskIdRef.current, data }),
        });
        if (!res.ok) return;
        const body = await res.json();
        if (body.id && body.id !== currentTaskIdRef.current) {
          currentTaskIdRef.current = body.id;
          window.history.replaceState(null, "", `/form/${body.id}`);
        }
      } catch (err) {
        console.error("[FormHarness] createDataTask failed", err);
      } finally {
        creatingRef.current = false;
      }
    },
    [accessToken],
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Ignore same-origin messages — form messages come from the api iframe.
      if (event.origin === window.location.origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;

      if (process.env.NODE_ENV === "development") {
        console.log("[FormHarness] message", msg.type ?? Object.keys(msg));
      }

      if (msg.type === "data-updated") {
        setIsLoading(false);
        const data = msg.data;
        if (data) {
          const hash = JSON.stringify(data);
          if (hash !== lastStateHashRef.current) {
            lastStateHashRef.current = hash;
            createDataTask(data);
          }
        }
        return;
      }
      if (msg.type === "onload") {
        setIsLoading(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [createDataTask]);

  return (
    <div className="relative h-screen w-screen">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900" />
        </div>
      )}
      {src && (
        <iframe
          src={src}
          title="form"
          className="h-full w-full"
          style={{ border: "none" }}
          // The form view may signal readiness via a postMessage type we don't
          // recognize, so clear the overlay once the document itself loads.
          onLoad={() => setIsLoading(false)}
        />
      )}
    </div>
  );
}
