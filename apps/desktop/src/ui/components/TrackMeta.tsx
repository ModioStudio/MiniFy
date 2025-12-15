type TrackMetaProps = {
  title?: string;
  artists?: string;
};

export function TrackMeta({ title = "—", artists = "" }: TrackMetaProps) {
  return (
    <div className="min-w-0">
      <div className="text-white font-circular truncate text-2xl">{title}</div>
      <div className="text-white/70 truncate text-base">{artists}</div>
    </div>
  );
}
