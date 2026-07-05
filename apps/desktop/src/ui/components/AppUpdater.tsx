import { ArrowClockwise, DownloadSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useUpdaterStore } from "../../lib/updaterStore";

// Renders the self-update overlay from the shared updater store: it silently
// checks on mount, and — when a newer signed release exists — surfaces a prompt,
// streams the download with a progress bar, installs, and relaunches. A manual
// check (Settings button) drives the same store and can raise this overlay too.
export default function AppUpdater() {
  const phase = useUpdaterStore((s) => s.phase);
  const update = useUpdaterStore((s) => s.update);
  const percent = useUpdaterStore((s) => s.percent);
  const indeterminate = useUpdaterStore((s) => s.indeterminate);
  const errorMsg = useUpdaterStore((s) => s.errorMsg);
  const startDownload = useUpdaterStore((s) => s.startDownload);
  const dismiss = useUpdaterStore((s) => s.dismiss);
  const check = useUpdaterStore((s) => s.check);

  const started = useRef(false);
  useEffect(() => {
    // React StrictMode mounts effects twice in dev; only check once.
    if (started.current) return;
    started.current = true;
    void check(false);
  }, [check]);

  if (phase === "hidden" || !update) return null;

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center p-3"
      style={{
        background: "rgba(0, 0, 0, 0.55)",
        backdropFilter: "blur(6px)",
        borderRadius: "12px",
      }}
    >
      <div
        className="max-h-full w-full max-w-[92%] overflow-y-auto rounded-xl border p-4 text-[--settings-text] shadow-2xl"
        style={{
          background: "var(--settings-panel-bg)",
          borderColor: "var(--settings-panel-border)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "color-mix(in srgb, var(--settings-accent) 22%, transparent)" }}
          >
            <DownloadSimple size={20} weight="fill" color="var(--settings-accent)" />
          </div>

          <div className="min-w-0 flex-1">
            {phase === "available" && (
              <>
                <div className="text-sm font-semibold">Update verfügbar</div>
                <div className="mt-0.5 text-xs text-[--settings-text-muted]">
                  Version {update.version}
                  {update.currentVersion ? ` · aktuell ${update.currentVersion}` : ""}
                </div>
                {update.body ? (
                  <p className="mt-2 max-h-12 overflow-y-auto whitespace-pre-line text-xs text-[--settings-text-muted]">
                    {update.body.trim()}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={dismiss}
                    className="rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-[--settings-item-hover] cursor-pointer"
                  >
                    Später
                  </button>
                  <button
                    type="button"
                    onClick={startDownload}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-black transition-transform hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
                    style={{ background: "var(--settings-accent)" }}
                  >
                    <DownloadSimple size={14} weight="bold" />
                    Herunterladen
                  </button>
                </div>
              </>
            )}

            {(phase === "downloading" || phase === "installing") && (
              <>
                <div className="text-sm font-semibold">
                  {phase === "installing" ? "Installiere Update…" : "Update wird geladen…"}
                </div>
                <div className="mt-0.5 text-xs text-[--settings-text-muted]">
                  {phase === "installing"
                    ? "Die App startet gleich neu."
                    : indeterminate
                      ? "Wird heruntergeladen…"
                      : `${percent}%`}
                </div>

                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--player-playbar-track-bg, rgba(255,255,255,0.16))" }}
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ease-out ${
                      indeterminate ? "animate-pulse" : ""
                    }`}
                    style={{
                      width: indeterminate ? "100%" : `${percent}%`,
                      background: "var(--player-playbar-track-fill, var(--settings-accent))",
                    }}
                  />
                </div>
              </>
            )}

            {phase === "error" && (
              <>
                <div className="text-sm font-semibold">Update fehlgeschlagen</div>
                <p className="mt-1 max-h-12 overflow-y-auto text-xs text-[--settings-text-muted]">
                  {errorMsg || "Unbekannter Fehler beim Aktualisieren."}
                </p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={dismiss}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-[--settings-item-hover] cursor-pointer"
                  >
                    <X size={14} />
                    Schließen
                  </button>
                  <button
                    type="button"
                    onClick={startDownload}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-black transition-transform hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
                    style={{ background: "var(--settings-accent)" }}
                  >
                    <ArrowClockwise size={14} weight="bold" />
                    Erneut versuchen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
