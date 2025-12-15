type TrackCoverProps = {
  src: string | null;
  size?: number;
};

export function TrackCover({ src, size = 72 }: TrackCoverProps) {
  return (
    <div
      className="rounded-md overflow-hidden bg-neutral-800 shrink-0"
      style={{ width: size, height: size }}
    >
      {src && <img src={src} alt="Track cover" className="w-full h-full object-cover" />}
    </div>
  );
}
