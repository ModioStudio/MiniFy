import { Pause, Play, SkipBack, SkipForward } from "@phosphor-icons/react";

function PlayerMockLayoutB() {
  return (
    <div
      className="
        h-[200px] w-[400px]
        grid grid-rows-[auto_1fr_auto]
        px-3 pt-4 pb-6
      "
      style={{
        background: "linear-gradient(to top, #b7b7b7, #c9c9c9, #dadada, #ededed, #ffffff)",
        borderRadius: 18,
        boxShadow: "0 12px 30px rgba(0, 0, 0, 0.18)",
        color: "#000",
      }}
    >
      {/* TOP */}
      <div className="flex gap-4">
        {/* Cover */}
        <div
          className="overflow-hidden shrink-0"
          style={{
            width: 86,
            height: 86,
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.18)",
            background: "#ddd",
          }}
        >
          <img
            src="https://picsum.photos/300"
            alt="Track cover"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Meta */}
        <div className="flex flex-col justify-center min-w-0">
          <div
            className="truncate text-2xl -mt-7 font-circular"
            style={{ fontWeight: 600, color: "#000" }}
          >
            Midnight Drive
          </div>

          <div
            className="truncate text-base -mt-1.5 -ml-17"
            style={{ color: "rgba(26,26,26,0.65)" }}
          >
            Lunar Echoes
          </div>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="flex items-center justify-center gap-8">
        <button type="button" className="p-2 rounded-full hover:bg-black/5">
          <SkipBack size={22} color="#1A1A1A" weight="fill" />
        </button>

        <button type="button" className="p-3 rounded-full hover:bg-black/10">
          <Pause size={32} color="#000" weight="fill" />
        </button>

        <button type="button" className="p-2 rounded-full hover:bg-black/5">
          <SkipForward size={22} color="#1A1A1A" weight="fill" />
        </button>
      </div>

      {/* PLAYBAR */}
      <div className="-mt-7">
        <div
          className="flex items-center justify-between text-sm mb-1 tabular-nums"
          style={{ color: "rgba(26,26,26,0.65)" }}
        >
          <span>1:08</span>
          <span>3:34</span>
        </div>

        <div
          className="relative h-2 w-full rounded-full"
          style={{ background: "rgba(0,0,0,0.14)" }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: "32%",
              background: "linear-gradient(90deg, #444444 0%, #000000 100%)",
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 -ml-1 h-3 w-3 rounded-full"
            style={{
              left: "32%",
              background: "#000",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default PlayerMockLayoutB;
