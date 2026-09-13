import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Axis = "x" | "y";

type ResizeHandleProps = {
  /** "x" drags left/right (sidebar width), "y" drags up/down (player height). */
  axis: Axis;
  value: number;
  min: number;
  max: number;
  /** Multiplier on the pointer delta. Use -1 when growing means moving up/left. */
  direction?: 1 | -1;
  step?: number;
  defaultValue?: number;
  className?: string;
  label: string;
  onChange: (next: number) => void;
  /** Called once when a drag ends, so callers can persist without thrashing. */
  onCommit?: (next: number) => void;
};

const KEYBOARD_STEP = 16;

/**
 * A one-pixel seam that widens into a grab target on hover. Keeping the hit
 * area larger than the visible line is what makes edge dragging feel reliable
 * without drawing a chunky splitter.
 */
export default function ResizeHandle({
  axis,
  value,
  min,
  max,
  direction = 1,
  step = KEYBOARD_STEP,
  defaultValue,
  className = "",
  label,
  onChange,
  onCommit,
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const origin = useRef({ pointer: 0, value: 0 });
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  }, [value]);

  const clamp = useCallback(
    (next: number) => Math.round(Math.min(max, Math.max(min, next))),
    [max, min]
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = {
        pointer: axis === "x" ? event.clientX : event.clientY,
        value: latest.current,
      };
      setDragging(true);
    },
    [axis]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragging) return;
      const pointer = axis === "x" ? event.clientX : event.clientY;
      const next = clamp(origin.current.value + (pointer - origin.current.pointer) * direction);
      latest.current = next;
      onChange(next);
    },
    [axis, clamp, direction, dragging, onChange]
  );

  const endDrag = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragging) return;
      setDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      onCommit?.(latest.current);
    },
    [dragging, onCommit]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const grow = axis === "x" ? "ArrowRight" : "ArrowUp";
      const shrink = axis === "x" ? "ArrowLeft" : "ArrowDown";
      if (event.key !== grow && event.key !== shrink) return;

      event.preventDefault();
      const delta = event.key === grow ? step : -step;
      const next = clamp(latest.current + delta * (axis === "x" ? 1 : -direction));
      latest.current = next;
      onChange(next);
      onCommit?.(next);
    },
    [axis, clamp, direction, onChange, onCommit, step]
  );

  return (
    <hr
      className={`resize-handle resize-handle-${axis} ${className} ${dragging ? "is-dragging" : ""}`}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        const reset = clamp(defaultValue ?? value);
        latest.current = reset;
        onChange(reset);
        onCommit?.(reset);
      }}
    />
  );
}
