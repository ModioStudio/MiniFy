export function SplashScreen() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-[#000000]">
      <div className="flex flex-col items-center gap-6 animate-splash-fade-in">
        <div className="relative">
          <div className="absolute inset-0 blur-3xl opacity-20 bg-white rounded-full scale-[2]" />
          <img
            src="/logo.png"
            alt="MiniFy"
            className="w-28 h-28 relative z-10 animate-splash-pulse"
            draggable={false}
          />
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-splash-bounce delay-0" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-splash-bounce delay-150" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-splash-bounce delay-300" />
        </div>
      </div>
    </div>
  );
}
