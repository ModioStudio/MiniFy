import { invoke } from "@tauri-apps/api/core";

export type Layout = "A" | "B" | "C" | "D" | "Settings" | "SearchSongs";

export default function useWindowLayout() {
  const setLayout = async (layout: Layout) => {
    await invoke("set_layout", { layout });
  };

  return { setLayout };
}
