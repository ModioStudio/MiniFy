import { useEffect, useState } from "react";
import TrackInfoLayoutA from "../components/LayoutTrackInfo/TrackInfoLayoutA";
import { TrackCover } from "../components/TrackDataComponent/TrackCover";
import { type CurrentlyPlaying, fetchCurrentlyPlaying, getLargestImageUrl } from "../spotifyClient";
import useWindowLayout from "../hooks/useWindowLayout";

function LayoutA() {
  const [state, setState] = useState<CurrentlyPlaying | null>(null);

 const { setLayout } = useWindowLayout(); 

  useEffect(() => {
    setLayout("A");
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const cp = await fetchCurrentlyPlaying();
        if (mounted) setState(cp);
      } catch (e) {
        console.error(e);
      }
    };
    load();
    const id = setInterval(load, 3_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const cover = state?.item ? getLargestImageUrl(state.item.album.images) : null;

  return (
    <div className="h-full w-full flex flex-row gap-4 rounded-xl px-3 pt-4 pb-6 text-white shadow-lg">
      <div className="border-white flex items-center justify-center rounded-md p-4 ">
        <TrackCover src={cover} size={128} />
      </div>
      <TrackInfoLayoutA />
    </div>
  );
}

export default LayoutA;
