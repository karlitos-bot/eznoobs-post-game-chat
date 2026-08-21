import { useRouterState } from "@tanstack/react-router";
import { Swords, Timer, Zap } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

import "./home-live-preview.css";

export function HomeLivePreview() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pathname !== "/") {
      setMount(null);
      return;
    }

    const hero = document.querySelector<HTMLElement>("main > div:first-child > section:first-child");
    if (!hero) return;

    const anchor = document.createElement("div");
    anchor.className = "ez-home-preview-anchor";
    anchor.dataset.ezHomePreview = "true";

    const existing = hero.querySelector<HTMLElement>(":scope > [data-ez-home-preview='true']");
    existing?.remove();

    const processStrip = hero.children.item(1);
    if (processStrip) hero.insertBefore(anchor, processStrip);
    else hero.appendChild(anchor);

    setMount(anchor);
    return () => {
      setMount(null);
      anchor.remove();
    };
  }, [pathname]);

  if (!mount) return null;

  return createPortal(
    <section className="ez-home-live-preview" aria-hidden="true">
      <div className="ez-home-preview-topline">
        <div className="ez-home-preview-live">
          <span className="ez-home-preview-dot" />
          LIVE ROOM
        </div>
        <span className="ez-home-preview-game">VALORANT</span>
        <span className="ez-home-preview-time"><Timer className="size-3" /> 03:41</span>
      </div>

      <div className="ez-home-preview-stage">
        <div className="ez-home-preview-message ez-home-preview-blue ez-home-preview-m1">
          <span className="ez-home-preview-avatar">PG</span>
          <div>
            <div className="ez-home-preview-meta"><b>pixelghost</b><span>BLUE</span></div>
            <p>gg?</p>
          </div>
        </div>

        <div className="ez-home-preview-message ez-home-preview-red ez-home-preview-m2">
          <span className="ez-home-preview-avatar">VL</span>
          <div>
            <div className="ez-home-preview-meta"><b>viperline</b><span>RED</span></div>
            <p>you whiffed the whole mag 💀</p>
            <div className="ez-home-preview-reactions">
              <span>💀 <b>6</b></span>
              <span>🧂 <b>3</b></span>
              <span>GG <b>2</b></span>
            </div>
          </div>
        </div>

        <div className="ez-home-preview-message ez-home-preview-blue ez-home-preview-m3">
          <span className="ez-home-preview-avatar">PG</span>
          <div>
            <div className="ez-home-preview-meta"><b>pixelghost</b><span>BLUE</span></div>
            <p>RUN IT BACK</p>
          </div>
        </div>
      </div>

      <div className="ez-home-preview-footer">
        <div className="ez-home-preview-salt">
          <Zap className="size-3" /> SALT <strong>SPICY</strong>
          <span><i /><i /><i /><i /></span>
        </div>
        <div className="ez-home-preview-runback">
          <Swords className="size-3.5" /> 4/4 WANT THE RUNBACK
        </div>
      </div>
    </section>,
    mount,
  );
}
