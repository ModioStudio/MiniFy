import { ArrowLeft, MusicNotes, SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import { createSpotifyProvider } from "../../providers/spotify";
import type { UnifiedPlaylist } from "../../providers/types";
import LocalPlaylistTracks from "../components/LocalPlaylistTracks";

export default function PlaylistView({ onBack }: { onBack: () => void }) {
  const { setLayout } = useWindowLayout();
  const [playlists, setPlaylists] = useState<UnifiedPlaylist[]>([]);
  const [selected, setSelected] = useState<UnifiedPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownOnly, setOwnOnly] = useState(false);
  useEffect(() => {
    setLayout("SearchSongs");
  }, [setLayout]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const all: UnifiedPlaylist[] = [];
      let offset = 0;
      while (alive) {
        const page = await createSpotifyProvider().getUserPlaylists(50, offset);
        all.push(...page.playlists);
        offset += page.playlists.length;
        if (alive) setPlaylists([...all]);
        if (!page.playlists.length || offset >= page.total) break;
      }
    })()
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="library-mini-view">
      <header>
        <h1>{selected?.name ?? "Playlists"}</h1>
        <button
          type="button"
          onClick={() => (selected ? setSelected(null) : onBack())}
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft size={20} />
        </button>
      </header>
      {selected ? (
        <LocalPlaylistTracks key={selected.id} playlist={selected} />
      ) : (
        <>
          <label className="library-own-filter">
            <input
              type="checkbox"
              checked={ownOnly}
              onChange={(e) => setOwnOnly(e.target.checked)}
            />
            My playlists
          </label>
          {error && (
            <p className="library-error" role="alert">
              {error}
            </p>
          )}
          {loading && <SpinnerGap size={20} className="animate-spin" />}
          <div className="library-picker-list">
            {playlists
              .filter((p) => !ownOnly || p.writable)
              .map((p) => (
                <button key={p.id} type="button" onClick={() => setSelected(p)}>
                  {p.images[0]?.url ? (
                    <img src={p.images[0].url} alt="" />
                  ) : (
                    <MusicNotes size={24} />
                  )}
                  <span>{p.name}</span>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
