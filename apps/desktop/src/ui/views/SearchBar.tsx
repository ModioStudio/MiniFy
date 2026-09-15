import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import MusicSearch from "../components/MusicSearch";

export default function SearchBar({ onBack }: { onBack: () => void }) {
  const { setLayout } = useWindowLayout();
  useEffect(() => {
    setLayout("SearchSongs");
  }, [setLayout]);
  return (
    <div className="library-mini-view">
      <header>
        <h1>Search</h1>
        <button type="button" onClick={onBack} title="Back" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
      </header>
      <MusicSearch />
    </div>
  );
}
