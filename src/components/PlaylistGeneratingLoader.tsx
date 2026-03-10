import { useEffect, useState } from "react";

interface PlaylistGeneratingLoaderProps {
  isVisible: boolean;
}

const loadingMessages = [
  "Analyzing Prompt...",
  "Finding your vibe...",
  "Curating tracks...",
  "Creating your playlist...",
];

function BlockLines() {
  return (
    <div className="flex-[1_0_0] h-[12px] min-h-px min-w-px relative">
      <div className="absolute inset-[-8.33%_0_0_0]">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 84 13">
          <g>
            <line stroke="#687382" strokeLinecap="round" x1="0.5" x2="83.5" y1="0.5" y2="0.5" />
            <line stroke="#687382" strokeLinecap="round" x1="0.5" x2="83.5" y1="6.5" y2="6.5" />
            <line stroke="#687382" strokeLinecap="round" x1="0.5" x2="83.5" y1="12.5" y2="12.5" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Block() {
  return (
    <div className="bg-[#3e454e] relative rounded-[6px] shrink-0 w-full block-item">
      <div aria-hidden="true" className="absolute border-[#535c68] border-[0.5px] border-solid inset-[-0.25px] pointer-events-none rounded-[6.25px]" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[8px] items-center px-[6px] py-[4px] relative w-full">
          <div className="relative shrink-0 size-[20px]">
            <svg className="absolute block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
              <circle cx="10" cy="10" fill="#687382" r="10" />
            </svg>
          </div>
          <BlockLines />
        </div>
      </div>
    </div>
  );
}

export function PlaylistGeneratingLoader({ isVisible }: PlaylistGeneratingLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0a0b0d]">
      <div className="bg-[#15171a] relative rounded-[12px] w-[470px]">
        <div className="content-stretch flex flex-col gap-[20px] items-center overflow-clip pb-[24px] pt-[20px] px-[54px] relative rounded-[inherit]">
          <div className="bg-[#2a2e34] h-[138px] relative rounded-[12px] shrink-0 w-[136px] overflow-hidden">
            <div className="content-stretch flex flex-col gap-[10px] items-start p-[6px] relative rounded-[inherit] size-full">
              <div className="blocks-container absolute left-[6px] right-[6px] flex flex-col gap-[10px]">
                <div className="block-wrapper block-1">
                  <Block />
                </div>
                <div className="block-wrapper block-2">
                  <Block />
                </div>
                <div className="block-wrapper block-3">
                  <Block />
                </div>
              </div>
            </div>
            <div aria-hidden="true" className="absolute border-[#535c68] border-[0.5px] border-solid inset-[-0.25px] pointer-events-none rounded-[12.25px]" />
          </div>

          <div className="absolute h-[44px] left-[105px] top-[130px] w-[261px] pointer-events-none">
            <div className="absolute inset-[-40.91%_-6.9%]">
              <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 297 80">
                <g filter="url(#filter0_f_71_637)">
                  <ellipse cx="148.5" cy="40" fill="#15171A" rx="130.5" ry="22" />
                </g>
                <defs>
                  <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="80" id="filter0_f_71_637" width="297" x="0" y="0">
                    <feFlood floodOpacity="0" result="BackgroundImageFix" />
                    <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
                    <feGaussianBlur result="effect1_foregroundBlur_71_637" stdDeviation="9" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>

          <div className="content-stretch flex flex-col gap-[8px] items-center justify-center relative shrink-0">
            <p className="font-['Host_Grotesk',sans-serif] font-semibold leading-[1.2] not-italic relative shrink-0 text-[18px] text-center text-white tracking-[-0.18px] transition-opacity duration-300">
              {loadingMessages[messageIndex]}
            </p>
          </div>
        </div>
        <div aria-hidden="true" className="absolute border-[#2c2c2c] border-[0.5px] border-solid inset-[-0.25px] pointer-events-none rounded-[12.25px]" />
      </div>

      <style>{`
        @keyframes blockAnimation {
          0% {
            transform: translateX(-150px);
            opacity: 0;
          }
          10% {
            transform: translateX(0);
            opacity: 1;
          }
          50% {
            transform: translateX(0) translateY(0);
          }
          55% {
            transform: translateX(0) translateY(-76px);
          }
          100% {
            transform: translateX(0) translateY(-76px);
          }
        }

        .blocks-container {
          top: 6px;
        }

        .block-wrapper {
          animation: blockAnimation 6s ease-in-out infinite;
          animation-fill-mode: backwards;
          opacity: 0;
        }

        .block-1 {
          animation-delay: 0s;
        }

        .block-2 {
          animation-delay: 0.6s;
        }

        .block-3 {
          animation-delay: 1.2s;
        }

        .block-item {
          height: 28px;
        }
      `}</style>
    </div>
  );
}
