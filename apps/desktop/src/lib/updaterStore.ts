import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

export type UpdaterPhase = "hidden" | "available" | "downloading" | "installing" | "error";

// Feedback surface for a user-triggered check (e.g. the Settings button), kept
// separate from the overlay phase so "you're up to date" can be shown inline.
export type ManualCheckState = "idle" | "checking" | "up-to-date" | "error";

interface UpdaterState {
  phase: UpdaterPhase;
  update: Update | null;
  percent: number;
  indeterminate: boolean;
  errorMsg: string;
  manual: ManualCheckState;

  check: (manual?: boolean) => Promise<void>;
  startDownload: () => Promise<void>;
  dismiss: () => void;
}

let manualResetTimer: ReturnType<typeof setTimeout> | null = null;

function clearManualTimer() {
  if (manualResetTimer) {
    clearTimeout(manualResetTimer);
    manualResetTimer = null;
  }
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  phase: "hidden",
  update: null,
  percent: 0,
  indeterminate: false,
  errorMsg: "",
  manual: "idle",

  check: async (manual = false) => {
    const { phase } = get();
    // Never interrupt an in-flight download/install.
    if (phase === "downloading" || phase === "installing") return;

    clearManualTimer();
    if (manual) set({ manual: "checking" });

    try {
      const found = await check();
      if (found) {
        set({ update: found, phase: "available", manual: "idle" });
      } else if (manual) {
        set({ manual: "up-to-date" });
        manualResetTimer = setTimeout(() => set({ manual: "idle" }), 5000);
      }
    } catch (err) {
      // Auto checks stay silent (no endpoint in dev, offline, no release yet);
      // a manual check reports the failure to the user.
      if (manual) {
        set({ manual: "error", errorMsg: err instanceof Error ? err.message : String(err) });
        manualResetTimer = setTimeout(() => set({ manual: "idle" }), 6000);
      }
    }
  },

  startDownload: async () => {
    const { update } = get();
    if (!update) return;
    set({ phase: "downloading", percent: 0, indeterminate: false });

    let total = 0;
    let received = 0;
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            set({ indeterminate: total <= 0 });
            break;
          case "Progress":
            received += event.data.chunkLength;
            if (total > 0) {
              set({ percent: Math.min(100, Math.round((received / total) * 100)) });
            }
            break;
          case "Finished":
            set({ percent: 100, indeterminate: false });
            break;
        }
      });

      // Package is installed; hand off to the freshly installed version.
      set({ phase: "installing" });
      await relaunch();
    } catch (err) {
      set({ phase: "error", errorMsg: err instanceof Error ? err.message : String(err) });
    }
  },

  dismiss: () => set({ phase: "hidden" }),
}));
