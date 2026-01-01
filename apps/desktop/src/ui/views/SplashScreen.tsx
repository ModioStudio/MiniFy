export default function SplashScreen() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-[#000000]">
      <div className="flex flex-col items-center gap-6 animate-fadeIn">
        <div className="relative">
          <div className="absolute inset-0 blur-3xl opacity-20 bg-white rounded-full scale-[2]" />
          <img
            src="/logo.png"
            alt="MiniFy"
            className="w-28 h-28 relative z-10 animate-pulse-slow"
            draggable={false}
          />
        </div>

        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce-delayed-1" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce-delayed-2" />
          <div className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce-delayed-3" />
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes pulseSlow {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.85;
            transform: scale(0.98);
          }
        }

        @keyframes bounceSmall {
          0%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          50% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }

        .animate-pulse-slow {
          animation: pulseSlow 2s ease-in-out infinite;
        }

        .animate-bounce-delayed-1 {
          animation: bounceSmall 1s ease-in-out infinite;
          animation-delay: 0s;
        }

        .animate-bounce-delayed-2 {
          animation: bounceSmall 1s ease-in-out infinite;
          animation-delay: 0.15s;
        }

        .animate-bounce-delayed-3 {
          animation: bounceSmall 1s ease-in-out infinite;
          animation-delay: 0.3s;
        }
      `}</style>
    </div>
  );
}
