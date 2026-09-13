import { useEffect, useRef } from "react";
import { useUpdaterStore } from "../../lib/updaterStore";

// Runs the silent startup update check. Visible update affordances are rendered
// by the desktop shell so the mini player never gets an update popup.
export default function AppUpdater() {
  const check = useUpdaterStore((s) => s.check);

  const started = useRef(false);
  useEffect(() => {
    // React StrictMode mounts effects twice in dev; only check once.
    if (started.current) return;
    started.current = true;
    void check(false);
  }, [check]);

  return null;
}
