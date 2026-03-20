"use client";

import { useEffect } from "react";

import { captureException } from "@/lib/error-tracking";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    captureException(error, { source: "global-error-boundary" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="space-y-3 text-center">
        <h2 className="text-xl font-semibold">Щось пішло не так</h2>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          Спробувати знову
        </button>
      </div>
    </div>
  );
}

