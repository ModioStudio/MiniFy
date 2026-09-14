import { Shuffle } from "@phosphor-icons/react";
import { toggleShuffle, useShuffleStore } from "../../lib/playback/shuffle";

/** Spotify's shuffle toggle; accent colour and a dot underneath when on. */
export default function ShuffleButton() {
  const on = useShuffleStore((state) => state.on);
  const busy = useShuffleStore((state) => state.busy);
  const label = on ? "Disable shuffle" : "Enable shuffle";

  return (
    <button
      type="button"
      className={`desktop-shuffle ${on ? "is-on" : ""}`}
      onClick={() => {
        toggleShuffle().catch((error) => console.error("Shuffle toggle failed:", error));
      }}
      disabled={busy}
      aria-pressed={on}
      aria-label={label}
      title={label}
    >
      <Shuffle size={20} weight="bold" />
    </button>
  );
}
