type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}

const ROOM_PATH_RE = /\/room\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}(?=\/|\?|#|$)/gi;

function redactRoomCode(value: string) {
  return value.replace(ROOM_PATH_RE, "/room/[code]");
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const safeRoute = redactRoomCode(window.location.pathname);

  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: safeRoute,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );

  // Prod React does not rethrow boundary-caught errors to window.onerror, so the
  // editor's telemetry never sees them. Forward to lovable.js's reporting hook,
  // which is present only inside the editor preview. Temporary room codes are
  // redacted from route/URL strings before they are passed to the diagnostic hook.
  const message =
    error instanceof Response
      ? redactRoomCode(`Response ${error.status}${error.url ? ` at ${error.url}` : ""}`)
      : error instanceof Error
        ? redactRoomCode(error.message)
        : redactRoomCode(String(error));
  const stack = error instanceof Error ? redactRoomCode(error.stack ?? "") || undefined : undefined;

  window.__lovableReportRuntimeError?.({
    message,
    ...(stack !== undefined && { stack }),
    filename: safeRoute,
  });
}
