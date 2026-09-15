import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

/** Every row is this tall, which is what lets the list draw only what is on screen. */
export const ROW_HEIGHT = 60;
/** Rows drawn past each edge of the view, so fast scrolling never shows a gap. */
const OVERSCAN = 10;
/** Pixels the pointer travels before a press becomes a drag; less is a click. */
const DRAG_THRESHOLD = 5;
/** Band at the scroller's edges where the list scrolls by itself while dragging. */
const EDGE = 64;
const MAX_SCROLL_STEP = 16;
/** How long a dropped row takes to glide into its slot. */
const SETTLE_MS = 160;

export type RowDrag = { from: number; to: number };

type Press = {
  index: number;
  pointerId: number;
  startX: number;
  startY: number;
  /** Where in the row the pointer took hold. */
  grabY: number;
  lastY: number;
  started: boolean;
  frame: number;
};

function scroller(node: HTMLElement): HTMLElement | null {
  for (let element = node.parentElement; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    if (overflowY === "auto" || overflowY === "scroll") return element;
  }
  return null;
}

/**
 * A list of equal-height rows that only draws the rows in view, the way
 * Spotify's own track lists work: a 400-song playlist keeps a few dozen rows in
 * the page instead of all of them. Rows can be dragged to a new place; the
 * others slide aside, and the list scrolls when the pointer nears its edges.
 */
export function useTrackRows(count: number, onReorder?: (from: number, to: number) => void) {
  const listRef = useRef<HTMLOListElement>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 30) });
  const [drag, setDrag] = useState<RowDrag | null>(null);
  const dragRef = useRef<RowDrag | null>(null);
  const pressing = useRef(false);
  const suppressClick = useRef(false);
  const reorder = useRef(onReorder);
  const countRef = useRef(count);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    reorder.current = onReorder;
  });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const view = scroller(list);
    const viewTop = view ? view.getBoundingClientRect().top : 0;
    const viewHeight = view ? view.clientHeight : window.innerHeight;
    const listTop = list.getBoundingClientRect().top;
    const total = countRef.current;
    const start = Math.max(0, Math.floor((viewTop - listTop) / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(
      total,
      Math.ceil((viewTop + viewHeight - listTop) / ROW_HEIGHT) + OVERSCAN
    );
    setRange((current) =>
      current.start === start && current.end === end
        ? current
        : { start, end: Math.max(start, end) }
    );
  }, []);

  useLayoutEffect(() => {
    countRef.current = count;
    measure();
  }, [count, measure]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const view = scroller(list);
    let frame = 0;
    const onChange = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const target: HTMLElement | Window = view ?? window;
    target.addEventListener("scroll", onChange, { passive: true });
    const resize = new ResizeObserver(onChange);
    if (view) resize.observe(view);
    return () => {
      target.removeEventListener("scroll", onChange);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure]);

  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, index: number) => {
    const list = listRef.current;
    // dragRef stays set while a dropped row settles; a press then must wait.
    if (!list || !reorder.current || event.button !== 0 || pressing.current || dragRef.current)
      return;
    if (event.target instanceof Element && event.target.closest("[data-no-drag]")) return;

    const press: Press = {
      index,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grabY: event.clientY - list.getBoundingClientRect().top - index * ROW_HEIGHT,
      lastY: event.clientY,
      started: false,
      frame: 0,
    };
    pressing.current = true;
    const view = scroller(list);
    const row = () => list.querySelector<HTMLElement>(`[data-row="${press.index}"]`);

    // The dragged row follows the pointer directly; the rows it passes move
    // through React state, so rows that scroll into view mid-drag slide too.
    const position = () => {
      const last = countRef.current - 1;
      const y = press.lastY - list.getBoundingClientRect().top - press.grabY;
      const top = Math.max(0, Math.min(last * ROW_HEIGHT, y));
      const element = row();
      if (element) {
        element.style.transform = `translate3d(0, ${top - press.index * ROW_HEIGHT}px, 0)`;
      }
      const to = Math.max(0, Math.min(last, Math.round(top / ROW_HEIGHT)));
      if (dragRef.current && dragRef.current.to !== to) {
        dragRef.current = { from: press.index, to };
        setDrag(dragRef.current);
      }
    };

    const tick = () => {
      const box = view ? view.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const above = box.top + EDGE - press.lastY;
      const below = press.lastY - (box.bottom - EDGE);
      const step =
        above > 0
          ? -Math.min(MAX_SCROLL_STEP, (above / EDGE) * MAX_SCROLL_STEP)
          : below > 0
            ? Math.min(MAX_SCROLL_STEP, (below / EDGE) * MAX_SCROLL_STEP)
            : 0;
      if (step) {
        if (view) view.scrollTop += step;
        else window.scrollBy(0, step);
        position();
      }
      press.frame = requestAnimationFrame(tick);
    };

    const begin = () => {
      press.started = true;
      dragRef.current = { from: press.index, to: press.index };
      // Committed at once, so the row wears its lifted look before it moves.
      flushSync(() => setDrag(dragRef.current));
      document.body.classList.add("is-sorting-rows");
      window.getSelection()?.removeAllRanges();
      press.frame = requestAnimationFrame(tick);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerId !== press.pointerId) return;
      press.lastY = e.clientY;
      if (!press.started) {
        if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < DRAG_THRESHOLD) return;
        begin();
      }
      e.preventDefault();
      position();
    };

    const finish = (commit: boolean) => {
      detach();
      cleanup.current = null;
      pressing.current = false;
      if (!press.started) return;
      // The click that follows the drop must not also play the song.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 400);

      const to = commit && dragRef.current ? dragRef.current.to : press.index;
      if (!commit) {
        dragRef.current = { from: press.index, to: press.index };
        flushSync(() => setDrag(dragRef.current));
      }
      const element = row();
      element?.classList.add("is-settling");
      if (element)
        element.style.transform = `translate3d(0, ${(to - press.index) * ROW_HEIGHT}px, 0)`;
      window.setTimeout(() => {
        // One commit for the new order and the end of the drag, which also
        // turns the slide transition off: otherwise every row would animate
        // away from the spot it already sits in.
        flushSync(() => {
          dragRef.current = null;
          setDrag(null);
          if (to !== press.index) reorder.current?.(press.index, to);
        });
        if (element) {
          element.classList.remove("is-settling");
          element.style.transform = "";
        }
        document.body.classList.remove("is-sorting-rows");
      }, SETTLE_MS);
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId === press.pointerId) finish(true);
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === press.pointerId) finish(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && press.started) {
        e.preventDefault();
        finish(false);
      }
    };
    const detach = () => {
      cancelAnimationFrame(press.frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    cleanup.current = () => {
      detach();
      pressing.current = false;
      document.body.classList.remove("is-sorting-rows");
    };
  }, []);

  const onClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const indices: number[] = [];
  for (let index = range.start; index < Math.min(range.end, count); index++) indices.push(index);
  // The dragged row stays drawn even after scrolling far from where it started.
  if (drag && drag.from < count && (drag.from < range.start || drag.from >= range.end)) {
    indices.push(drag.from);
  }

  const rowStyle = (index: number): CSSProperties => {
    let shift = 0;
    if (drag && index !== drag.from) {
      if (drag.from < index && index <= drag.to) shift = -ROW_HEIGHT;
      else if (drag.to <= index && index < drag.from) shift = ROW_HEIGHT;
    }
    // The dragged row never gets a transform from here; position() owns it.
    return {
      top: index * ROW_HEIGHT,
      transform: shift ? `translate3d(0, ${shift}px, 0)` : undefined,
    };
  };

  return {
    listRef,
    indices,
    drag,
    rowStyle,
    listHeight: count * ROW_HEIGHT,
    onPointerDown,
    onClickCapture,
  };
}
