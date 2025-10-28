import { Bug, GearSix, Minus, Square, X } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type ContextMenuProps = {
  visible: boolean;
  x: number;
  y: number;
  onRequestClose: () => void;
  onOpenSettings: () => void;
};

export default function ContextMenu({
  visible,
  x,
  y,
  onRequestClose,
  onOpenSettings,
}: ContextMenuProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuSize, setMenuSize] = useState<{ w: number; h: number }>({ w: 192, h: 220 });

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRequestClose();
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) onRequestClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [visible, onRequestClose]);

  useLayoutEffect(() => {
    if (!visible) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setMenuSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible]);

  if (!visible) return null;

  const safeX = Math.max(8, Math.min(x, window.innerWidth - menuSize.w - 8));
  const safeY = Math.max(8, Math.min(y, window.innerHeight - menuSize.h - 8));

  const run = async (fn: () => Promise<void> | void) => {
    try {
      await fn();
    } finally {
      onRequestClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 no-drag"
      onContextMenu={(e) => {
        e.preventDefault();
        onRequestClose();
      }}
    >
      <div
        ref={containerRef}
        className="absolute w-48 rounded-xl bg-black/80 text-white shadow-xl border border-white/10 backdrop-blur no-drag"
        style={{ left: safeX, top: safeY }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-left"
          onClick={() => run(() => onOpenSettings())}
        >
          <GearSix size={18} weight="fill" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-left"
          onClick={() =>
            run(async () => {
              await invoke("open_webview_devtools");
            })
          }
        >
          <Bug size={18} weight="fill" />
          <span>Debug</span>
        </button>
        <div className="h-px bg-white/10 my-1" />
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-left"
          onClick={() =>
            run(async () => {
              await getCurrentWindow().minimize();
            })
          }
        >
          <Minus size={18} weight="bold" />
          <span>Minimize</span>
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-left"
          onClick={() =>
            run(async () => {
              await getCurrentWindow().toggleMaximize();
            })
          }
        >
          <Square size={18} weight="bold" />
          <span>Maximize</span>
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-left text-red-300"
          onClick={() =>
            run(async () => {
              await getCurrentWindow().close();
            })
          }
        >
          <X size={18} weight="bold" />
          <span>Close</span>
        </button>
      </div>
    </div>
  );
}
