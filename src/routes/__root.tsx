import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import accessibilityCss from "../accessibility.css?url";
import appCss from "../styles.css?url";
import mobileQaCss from "../mobile-qa.css?url";
import phaseABatch2Css from "../phase-a-batch2.css?url";
import phaseAPolishCss from "../phase-a-polish.css?url";
import { AccessibilityLayer } from "@/components/eznoobs/AccessibilityLayer";
import { FirstUseSafetyGate } from "@/components/eznoobs/FirstUseSafetyGate";
import { HomeLegalNav } from "@/components/eznoobs/HomeLegalNav";
import { HomeLivePreview } from "@/components/eznoobs/HomeLivePreview";
import { LobbyPersonalityLayer } from "@/components/eznoobs/LobbyPersonalityLayer";
import { LobbyShowtimeLayer } from "@/components/eznoobs/LobbyShowtimeLayer";
import { RoomClarityLayer } from "@/components/eznoobs/RoomClarityLayer";
import { RoomExperienceLayer } from "@/components/eznoobs/RoomExperienceLayer";
import { RoomExpiryGuard } from "@/components/eznoobs/RoomExpiryGuard";
import { SecureRealtimeLayer } from "@/components/eznoobs/SecureRealtimeLayer";
import { Toaster } from "@/components/ui/sonner";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn&apos;t load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { title: "EZNOOBS — The match ended. The lobby didn't." },
      {
        name: "description",
        content:
          "Temporary post-game chat lobbies for gamers. No account, no setup — share a code and keep talking.",
      },
      { name: "author", content: "EZNOOBS" },
      { property: "og:title", content: "EZNOOBS" },
      {
        property: "og:description",
        content: "Temporary post-game lobbies for GGs, trash talk and unfinished business.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/eznoobs-logo.webp" },
      { property: "og:image:alt", content: "EZNOOBS gaming mascot and wordmark" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/eznoobs-logo.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: mobileQaCss,
      },
      {
        rel: "stylesheet",
        href: accessibilityCss,
      },
      {
        rel: "stylesheet",
        href: phaseAPolishCss,
      },
      {
        rel: "stylesheet",
        href: phaseABatch2Css,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/eznoobs-mark.png", type: "image/png" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AccessibilityLayer />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <HomeLivePreview />
      <HomeLegalNav />
      <SecureRealtimeLayer />
      <LobbyPersonalityLayer />
      <RoomClarityLayer />
      <RoomExperienceLayer />
      <LobbyShowtimeLayer />
      <RoomExpiryGuard />
      <FirstUseSafetyGate />
      <Toaster />
    </QueryClientProvider>
  );
}
