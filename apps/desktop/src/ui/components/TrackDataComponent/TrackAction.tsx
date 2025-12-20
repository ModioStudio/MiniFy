import { GearSix, PlusCircle } from "@phosphor-icons/react";

type TrackActionsProps = {
  onSave?: () => void;
  onSettings?: () => void;
  disableSave?: boolean;
  busy?: boolean;
};

export function TrackActions({ onSave, onSettings, disableSave, busy }: TrackActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {onSettings && (
        <button type="button" onClick={onSettings} style={{ color: "var(--player-actions-color)" }}>
          <GearSix size={20} weight="fill" />
        </button>
      )}

      {!disableSave && onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          style={{ color: "var(--player-actions-color)" }}
        >
          <PlusCircle size={20} weight="fill" />
        </button>
      )}
    </div>
  );
}
