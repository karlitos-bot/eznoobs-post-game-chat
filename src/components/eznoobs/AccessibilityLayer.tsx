import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export function AccessibilityLayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const previousPath = useRef(pathname);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;

    const timer = window.setTimeout(() => {
      const title = document.title.replace(/\s*[—|-]\s*EZNOOBS.*$/i, "").trim();
      setAnnouncement(title ? `Navigated to ${title}` : "Page changed");
    }, 120);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  function skipToMain() {
    const main = document.querySelector<HTMLElement>("main");
    if (!main) return;

    const hadTabIndex = main.hasAttribute("tabindex");
    if (!hadTabIndex) main.setAttribute("tabindex", "-1");

    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: "start" });

    if (!hadTabIndex) {
      main.addEventListener(
        "blur",
        () => {
          main.removeAttribute("tabindex");
        },
        { once: true },
      );
    }
  }

  return (
    <>
      <button type="button" onClick={skipToMain} className="ez-skip-link">
        Skip to main content
      </button>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </>
  );
}
