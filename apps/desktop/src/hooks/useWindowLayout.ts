import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

export type Layout = "A" | "B" | "C" | "D" | "Settings" | "SearchSongs" | "AIDJ" | "Volume";

export default function useWindowLayout() {
  const setLayout = useCallback(async (layout: Layout) => {
    await invoke("set_layout", { layout });
  }, []);

  return { setLayout };
}
