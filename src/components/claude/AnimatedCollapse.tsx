import { useRef, useLayoutEffect, useCallback } from "react";

interface AnimatedCollapseProps {
  expanded: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Smooth height animation for collapsible content.
 * Uses direct DOM manipulation via refs to avoid cascading renders.
 */
export function AnimatedCollapse({ expanded, children, className = "" }: AnimatedCollapseProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const applyStyles = useCallback(
    (el: HTMLDivElement, animate: boolean) => {
      if (expanded) {
        if (animate) {
          const measuredHeight = el.scrollHeight;
          el.style.overflow = "hidden";
          el.style.height = `${measuredHeight}px`;
          el.style.opacity = "1";
          const onEnd = () => {
            el.style.height = "auto";
            el.style.overflow = "visible";
            el.removeEventListener("transitionend", onEnd);
          };
          el.addEventListener("transitionend", onEnd);
        } else {
          el.style.height = "auto";
          el.style.overflow = "visible";
          el.style.opacity = "1";
        }
      } else {
        // When collapsing, immediately set the target styles.
        // In a real browser, rAF would create the two-frame trick for the
        // transition, but opacity/overflow are set instantly for correctness.
        el.style.overflow = "hidden";
        el.style.opacity = "0";
        if (animate) {
          const measuredHeight = el.scrollHeight;
          el.style.height = `${measuredHeight}px`;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.height = "0px";
            });
          });
        } else {
          el.style.height = "0px";
        }
      }
    },
    [expanded],
  );

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const animate = !firstRender.current;
    firstRender.current = false;
    applyStyles(el, animate);
  }, [expanded, applyStyles]);

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        transition: "height 200ms ease-in-out, opacity 200ms ease-in-out",
      }}
    >
      {children}
    </div>
  );
}
