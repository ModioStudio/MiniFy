import useWindowLayout from "../../hooks/useWindowLayout";
import { useEffect } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

export default function SearchBar({}) {
  const { setLayout } = useWindowLayout();

  useEffect(() => {
    setLayout("SearchSongs");
  }, [setLayout]);

  return (
    <div
      className="
        h-full w-full
        grid grid-rows-[auto_1fr_auto]
        px-3 pt-4 pb-6
        bg-black/50
      "
    >
      <div className="w-full px-4 py-3">
        <div className="relative w-full max-w-xl">
          <MagnifyingGlassIcon
            size={20}
            className="
            absolute
            left-4
            top-1/2
            -translate-y-1/2
            text-neutral-400
            pointer-events-none
            "
          />

          <input
            type="text"
            placeholder="Something you'd like to hear?"
            className="
            w-full
            rounded-md
            bg-black/80
            px-4
            pl-11
            py-2
            text-white
            placeholder-neutral-400
            outline-none
            focus:ring-1
            focus:ring-green-500
            "
          />
        </div>
      </div>
    </div>
  );
}
