import { useState, useEffect, useRef } from "react";
import svgPaths from "@/imports/svg-1ld9c2yews";
import imgFrame11 from "@/assets/91e27ff996613f9f938ceb824ea826782947d150.png";
import imgFrame13 from "@/assets/612ef5b329b80e17dee22db97e1e5e0192d6842b.png";
import imgFrame21 from "@/assets/1b5ff05cf3bd78fd850ed84324b46fc792e16e9d.png";
import imgFrame12 from "@/assets/e989678b82094821988125fff6d0a387cc062105.png";
import imgFrame16 from "@/assets/0f3d82602ef432077e6a41c68f06b4801c6aab34.png";
import imgFrame15 from "@/assets/da6c37e188c111ddd1f03d03c23aa4967fb32ee5.png";
import imgFrame14 from "@/assets/ef594a660caad80f9ce6b0cbbc4cb86f16d119dd.png";
import imgFrame17 from "@/assets/d689bf8caaf9e415a351c2f45ab643f24d8ab221.png";
import imgFrame18 from "@/assets/83fee6538db8d8f29a9edcb7199fee923da7672c.png";
import imgFrame22 from "@/assets/4538d2b61bbc9d880e96385cbe92133a85088189.png";
import imgFrame23 from "@/assets/03978d2df1989afbccaf0f0b58d184e91db7eadb.png";
import imgFrame24 from "@/assets/6be6beb294d174f88cfab1e3f7f4ceb675fb2f25.png";
import imgFrame25 from "@/assets/42c61559a3a6f14a5f4cd720782c35c3b1faa949.png";
import imgFrame26 from "@/assets/fdda2fcfbf3dc9d0cd96d3d8a7dd14c7d6a23934.png";
import imgFrame27 from "@/assets/0833103bda7670ad1a2ae14fccea3f93db529f79.png";

const headlines = [
  "Create a happy, upbeat playlist for good vibes",
  "Make a chill playlist for late nights",
  "Create an afrobeats playlist for a long drive",
  "Make a 2 hour gym workout playlist",
];

const images = [
  imgFrame11,
  imgFrame13,
  imgFrame21,
  imgFrame12,
  imgFrame16,
  imgFrame15,
  imgFrame14,
  imgFrame17,
  imgFrame18,
  imgFrame22,
  imgFrame23,
  imgFrame24,
  imgFrame25,
  imgFrame26,
  imgFrame27,
];

interface HeroProps {
  onGeneratePlaylist: (prompt: string) => void;
}

export function Hero({ onGeneratePlaylist }: HeroProps) {
  const [currentHeadline, setCurrentHeadline] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const handleGeneratePlaylist = () => {
    if (inputValue.trim()) {
      if (inputRef.current) {
        inputRef.current.setAttribute('readonly', 'true');
        inputRef.current.blur();
        setTimeout(() => {
          inputRef.current?.removeAttribute('readonly');
        }, 100);
      }
      console.log("Generating playlist for:", inputValue);
      onGeneratePlaylist(inputValue);
      setInputValue("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGeneratePlaylist();
    }
  };

  const handleInputAreaClick = () => {
    inputRef.current?.focus();
  };

  const toggleVoiceRecording = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in your browser. Please try Chrome or Edge.');
      return;
    }

    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
    } else {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(() => {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          const recognition = new SpeechRecognition();

          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onstart = () => {
            setIsRecording(true);
          };

          recognition.onresult = (event: any) => {
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
              }
            }

            if (finalTranscript) {
              setInputValue((prev) => {
                const baseText = prev ? prev + ' ' : '';
                return (baseText + finalTranscript).trim();
              });
            }
          };

          recognition.onerror = (event: any) => {
            setIsRecording(false);
            if (event.error === 'not-allowed' || event.error === 'no-speech' || event.error === 'aborted') {
              return;
            }
            console.warn('Speech recognition issue:', event.error);
          };

          recognition.onend = () => {
            setIsRecording(false);
          };

          recognitionRef.current = recognition;
          recognition.start();
        })
        .catch((error) => {
          setIsRecording(false);
          if (error.name === 'NotAllowedError') {
            alert('🎤 Microphone access is required for voice input.\n\nPlease click the camera/microphone icon in your browser\'s address bar and allow microphone access, then try again.');
          } else if (error.name === 'NotFoundError') {
            alert('No microphone found. Please connect a microphone and try again.');
          } else {
            alert('Unable to access microphone. Please check your browser settings and try again.');
          }
        });
    }
  };

  useEffect(() => {
    const targetText = headlines[currentHeadline];
    const typingSpeed = isDeleting ? 30 : 60;

    if (!isDeleting && displayedText === targetText) {
      setTimeout(() => setIsDeleting(true), 2000);
      return;
    }

    if (isDeleting && displayedText === "") {
      setIsDeleting(false);
      setCurrentHeadline((prev) => (prev + 1) % headlines.length);
      return;
    }

    const timeout = setTimeout(() => {
      setDisplayedText(
        isDeleting
          ? targetText.substring(0, displayedText.length - 1)
          : targetText.substring(0, displayedText.length + 1)
      );
    }, typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, currentHeadline]);

  return (
    <div className="relative min-h-screen bg-[#0a0b0d] overflow-hidden">
      {/* Scrolling Image Strip */}
      <div className="absolute top-[77px] left-0 right-0 h-[258px] overflow-hidden">
        <div className="relative h-full">
          <div
            className="flex gap-[20px] absolute animate-scroll"
            style={{
              animation: 'scroll 30s linear infinite',
            }}
          >
            {[...images, ...images, ...images].map((img, idx) => (
              <div key={idx} className="h-[258px] w-[197px] flex-shrink-0">
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a0b0d] via-transparent to-[#0a0b0d] pointer-events-none" />
          <div className="absolute inset-0 bg-[#0a0b0d] opacity-70" />
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-5 md:px-20 py-8">
        <div className="flex items-center">
          <div className="h-[25.735px] w-[79.228px]">
            <svg className="w-full h-full" fill="none" viewBox="0 0 79.2284 25.7347">
              <g>
                <path d={svgPaths.p23869b00} fill="white" />
                <path d={svgPaths.p2cdbe2f0} fill="white" />
                <path d={svgPaths.p1294a500} fill="white" />
                <path d={svgPaths.p2ab35100} fill="white" />
              </g>
            </svg>
          </div>
        </div>
      </header>

      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-5 pt-24 md:pt-32 pb-20 bg-[#0a0b0d00]">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h1 className="text-[#f0f1f2] text-[36px] md:text-[56px] leading-[1.2] tracking-[-0.56px] h-[135px] md:h-[134px]">
            {displayedText}
            <span className="animate-pulse">|</span>
          </h1>
          <p className="text-[#dedede] leading-[1.5] max-w-[460px] mx-auto text-[16px]">
            Type what you're feeling, moods, or moments, and we'll turn it into a playlist you can save and share.
          </p>
        </div>

        {/* Input Field */}
        <div className="mt-8 w-full max-w-[704px]">
          <div className="bg-[#15171a] rounded-[20px] border border-[rgba(42,52,50,0.2)] cursor-text px-[12px] py-[20px]" onClick={handleInputAreaClick}>
            <div className="relative mb-3">
              {!inputValue && (
                <p className="text-[#b4b4b4] absolute top-0 left-0 pointer-events-none text-[14px]">
                  Type your request
                </p>
              )}
              <textarea
                id="hero-prompt-input"
                name="prompt"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={handleKeyPress}
                rows={1}
                className="w-full bg-transparent text-[#f0f1f2] text-[15px] outline-none placeholder:text-[#6b6b6b] resize-none overflow-hidden leading-[1.5]"
                ref={inputRef}
              />
            </div>
            <div className="flex items-center justify-end gap-5">
              <button
                onClick={toggleVoiceRecording}
                className={`${
                  isRecording
                    ? 'bg-[#4feec5] animate-pulse'
                    : 'bg-[#2a2e34] hover:bg-[#3a3e44]'
                } transition-colors rounded-full p-2`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 12.0004 13.8441">
                  <path d={svgPaths.p2cbffe80} fill={isRecording ? '#0a0b0d' : '#A4ABB4'} />
                  <path d={svgPaths.p14f06280} fill={isRecording ? '#0a0b0d' : '#A4ABB4'} />
                  <path d={svgPaths.p4247e00} fill={isRecording ? '#0a0b0d' : '#A4ABB4'} />
                  <path d={svgPaths.pc2370b0} fill={isRecording ? '#0a0b0d' : '#A4ABB4'} />
                </svg>
              </button>
              <button
                onClick={handleGeneratePlaylist}
                className="bg-[#4feec5] hover:bg-[#3fd9b5] transition-all px-5 py-3 rounded-lg text-[#0a0b0d] text-[14px] shadow-[0_0_20px_rgba(79,238,197,0.3)] hover:shadow-[0_0_30px_rgba(79,238,197,0.5)]"
              >
                Generate Playlist
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-1500px);
          }
        }
      `}</style>
    </div>
  );
}
