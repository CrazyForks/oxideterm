// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react"
import { cn } from "../../lib/utils"

type SliderProps = {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
};

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({ min = 0, max = 100, step = 1, value, onChange, disabled, className }, ref) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    const dragging = React.useRef(false);

    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

    const resolve = React.useCallback(
      (clientX: number) => {
        const track = trackRef.current;
        if (!track) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const raw = min + ratio * (max - min);
        const stepped = Math.round(raw / step) * step;
        const clamped = Math.max(min, Math.min(max, stepped));
        // Avoid floating-point artefacts
        const decimals = (step.toString().split('.')[1] || '').length;
        onChange(parseFloat(clamped.toFixed(decimals)));
      },
      [min, max, step, onChange],
    );

    const onPointerDown = React.useCallback(
      (e: React.PointerEvent) => {
        if (disabled) return;
        e.preventDefault();
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        resolve(e.clientX);
      },
      [disabled, resolve],
    );

    const onPointerMove = React.useCallback(
      (e: React.PointerEvent) => {
        if (!dragging.current) return;
        resolve(e.clientX);
      },
      [resolve],
    );

    const onPointerUp = React.useCallback(() => {
      dragging.current = false;
    }, []);

    return (
      <div
        ref={ref}
        className={cn("relative flex items-center select-none touch-none", disabled && "opacity-50 pointer-events-none", className)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Track */}
        <div ref={trackRef} className="relative h-1.5 w-full rounded-full bg-theme-border/60">
          {/* Filled range */}
          <div
            className="absolute h-full rounded-full bg-theme-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Thumb */}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          className="absolute h-3.5 w-3.5 rounded-full border-2 border-theme-accent bg-theme-bg-panel shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-theme-accent/40"
          style={{ left: `calc(${pct}% - 7px)` }}
        />
      </div>
    );
  },
);
Slider.displayName = "Slider";

export { Slider };
