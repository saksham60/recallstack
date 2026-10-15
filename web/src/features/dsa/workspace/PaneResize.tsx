"use client";

import type { KeyboardEvent, PointerEvent } from "react";
export function PaneResize({
  label,
  value,
  min,
  max,
  onChange,
  horizontal = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  horizontal?: boolean;
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === (horizontal ? "ArrowUp" : "ArrowLeft")
        ? -2
        : event.key === (horizontal ? "ArrowDown" : "ArrowRight")
          ? 2
          : 0;
    if (delta || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onChange(
        event.key === "Home"
          ? min
          : event.key === "End"
            ? max
            : clamp(value + delta),
      );
    }
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const parent = horizontal
      ? element.parentElement!
      : element.closest(".studio-grid")!;
    const bounds = parent.getBoundingClientRect();
    const origin = horizontal ? event.clientY : event.clientX;
    element.setPointerCapture(event.pointerId);
    const move = (next: globalThis.PointerEvent) =>
      onChange(
        clamp(
          value +
            (((horizontal ? next.clientY : next.clientX) - origin) /
              (horizontal ? bounds.height : bounds.width)) *
              100,
        ),
      );
    const stop = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("lostpointercapture", stop);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("lostpointercapture", stop, { once: true });
  }
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`studio-resize ${horizontal ? "horizontal" : "vertical"}`}
      onKeyDown={key}
      onPointerDown={start}
    />
  );
}
