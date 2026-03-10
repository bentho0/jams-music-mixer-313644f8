import { useState, useRef, useEffect } from "react";
import { Hero } from "@/components/Hero";
import { PlaylistGeneratingLoader } from "@/components/PlaylistGeneratingLoader";
import { AIPlaylistDisplay } from "@/components/AIPlaylistDisplay";
import { projectId, publicAnonKey } from "@/config/supabase";
import { isFigmaSandbox } from "@/utils/sandbox";
import { apiFetch, isSandboxError } from "@/utils/apiClient";

interface PlaylistData {
  playlist_title: string;
  playlist_description: string;
  tracks: Array<{
    spotify_track_id: string;
    track_name: string;
    artist: string;
    album?: string;
    reason: string;
    album_art: string;
    duration_ms: number;
    duration_formatted: string;
    is_new: boolean;
    preview_url: string | null;
    spotify_url: string | null;
  }>;
  mood_tags: string[];
  audio_profile: {
    avg_tempo: number;
    avg_energy: number;
    avg_valence: number;
  };
}

const SERVER = `https://${projectId}.supabase.co/functions/v1/make-server-d124bc75`;

export function MainApp() {
  const [isGeneratingPlaylist, setIsGeneratingPlaylist] = useState(false);
  const [generatedPlaylist, setGeneratedPlaylist] = useState<PlaylistData | null>(null);
  const [playlistPrompt, setPlaylistPrompt] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [spotifySessionId, setSpotifySessionId] = useState<string | null>(null);
  const [isCompletingAuth, setIsCompletingAuth] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [sandboxBannerDismissed, setSandboxBannerDismissed] = useState(false);
  const isFigmaSandboxNow = isFigmaSandbox();
  const seenTrackIds = useRef<Set<string>>(new Set());
  const seenTrackNames = useRef<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error");

    if (code && state) {
      window.history.replaceState({}, "", "/");

      const pkceSessionId = localStorage.getItem("spotify_pkce_session");
      if (!pkceSessionId) {
        console.error("No PKCE session found in localStorage");
        return;
      }

      setIsCompletingAuth(true);

      apiFetch(`${SERVER}/auth/spotify/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ code, state, sessionId: pkceSessionId }),
      })
        .then((res) => res.json())
        .then((data) => {
          localStorage.removeItem("spotify_pkce_session");
          if (data.error) {
            console.error("Auth completion error:", data.error);
            alert(`Spotify connection failed: ${data.error}. Please try again.`);
          } else {
            setSpotifySessionId(data.sessionId);
            localStorage.setItem("spotify_session_id", data.sessionId);
          }
        })
        .catch((err) => console.error("Error completing Spotify auth:", err))
        .finally(() => {
          setIsCompletingAuth(false);
          const pendingPlaylist = sessionStorage.getItem("pending_playlist");
          const pendingPrompt = sessionStorage.getItem("pending_prompt");
          if (pendingPlaylist && pendingPrompt) {
            setGeneratedPlaylist(JSON.parse(pendingPlaylist));
            setPlaylistPrompt(pendingPrompt);
            sessionStorage.removeItem("pending_playlist");
            sessionStorage.removeItem("pending_prompt");
          }
        });

      return;
    }

    if (errorParam) {
      console.error("Spotify OAuth error:", errorParam);
      window.history.replaceState({}, "", "/");
      alert(`Spotify connection error: ${errorParam}`);
      return;
    }

    const stored = localStorage.getItem("spotify_session_id");
    if (stored) setSpotifySessionId(stored);
  }, []);

  const generatePlaylist = async (prompt: string, excludedTrackIds: string[] = []) => {
    if (isFigmaSandbox()) {
      setGenerationError(
        "Network requests are blocked in Figma's preview sandbox. " +
        "Open the published app URL in a browser tab to generate playlists."
      );
      return;
    }

    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      setGenerationError(null);
      setIsGeneratingPlaylist(true);

      console.log(`[Jams] Calling /generate-playlist → attempt ${attempt}/${MAX_ATTEMPTS}`, { prompt, excludedTrackIds: excludedTrackIds.length, excludedTrackNames: seenTrackNames.current.size });

      const response = await apiFetch(
        `${SERVER}/generate-playlist`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            prompt,
            excludedTrackIds,
            excludedTrackNames: Array.from(seenTrackNames.current),
          }),
        },
        90_000
      );

      console.log("[Jams] /generate-playlist response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("[Jams] Server error response:", errorData);
        throw new Error(errorData.message || errorData.error || "Failed to generate playlist");
      }

      const data = await response.json();
      console.log("[Jams] Playlist received — title:", data.playlist_title, "| tracks:", data.tracks?.length);

      (data.tracks ?? []).forEach((t: { spotify_track_id: string; track_name: string; artist: string }) => {
        if (t.spotify_track_id) seenTrackIds.current.add(t.spotify_track_id);
        if (t.track_name && t.artist) seenTrackNames.current.add(`"${t.track_name}" by ${t.artist}`);
      });

      setGeneratedPlaylist(data);
      setPlaylistPrompt(prompt);
      setIsGeneratingPlaylist(false);
      setIsRegenerating(false);
      return;
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.message.toLowerCase().includes("timeout") ||
          error.message.toLowerCase().includes("timed out") ||
          error.message.toLowerCase().includes("cold") ||
          error.message.toLowerCase().includes("aborted") ||
          error.message.toLowerCase().includes("network"));

      if (isTimeout && attempt < MAX_ATTEMPTS) {
        console.warn(`[Jams] Timeout on attempt ${attempt} — retrying automatically...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      console.error("[Jams] Error generating playlist:", error);
      setGenerationError(
        isSandboxError(error)
          ? "Network requests are blocked in Figma's preview sandbox. Open the published app URL."
          : error instanceof Error ? error.message : "Failed to generate playlist"
      );
      setIsGeneratingPlaylist(false);
      setIsRegenerating(false);
    }
    }

    setIsGeneratingPlaylist(false);
    setIsRegenerating(false);
  };

  const handleConnectSpotify = async () => {
    if (isFigmaSandbox()) {
      alert("Spotify connection is not available in Figma's preview sandbox.\nOpen the published app URL in a browser tab to connect.");
      return;
    }
    try {
      if (generatedPlaylist) {
        sessionStorage.setItem("pending_playlist", JSON.stringify(generatedPlaylist));
        sessionStorage.setItem("pending_prompt", playlistPrompt);
      }

      const redirectUri = window.location.origin + "/";

      const response = await apiFetch(`${SERVER}/auth/spotify/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ redirectUri }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      localStorage.setItem("spotify_pkce_session", data.sessionId);
      window.location.href = data.authUrl;
    } catch (error) {
      console.error("Error connecting to Spotify:", error);
      alert(
        "Failed to connect to Spotify: " +
          (error instanceof Error ? error.message : "Unknown error")
      );
    }
  };

  const handleDisconnectSpotify = () => {
    setSpotifySessionId(null);
    localStorage.removeItem("spotify_session_id");
  };

  const handleRegenerate = () => {
    if (playlistPrompt) {
      setIsRegenerating(true);
      generatePlaylist(playlistPrompt, Array.from(seenTrackIds.current));
    }
  };

  const handleEditPrompt = () => {
    setGeneratedPlaylist(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleClosePlaylist = () => {
    setGeneratedPlaylist(null);
    setPlaylistPrompt("");
  };

  return (
    <div className="min-h-screen bg-[#0a0b0d]">
      {isFigmaSandboxNow && !sandboxBannerDismissed && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 px-4 py-2.5 bg-yellow-500/10 border-b border-yellow-500/20 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <p className="text-yellow-300 text-xs leading-snug">
              <span className="font-semibold">Figma preview detected</span> — network requests are blocked in this sandbox.
            </p>
          </div>
          <button
            onClick={() => setSandboxBannerDismissed(true)}
            className="text-yellow-400/60 hover:text-yellow-300 transition-colors flex-shrink-0 ml-2"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      )}

      <Hero onGeneratePlaylist={generatePlaylist} />

      <PlaylistGeneratingLoader isVisible={isGeneratingPlaylist || isRegenerating} />

      {isCompletingAuth && (
        <div className="fixed inset-0 bg-[#0a0b0d]/90 z-50 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-2 border-[#4feec5]/20 border-t-[#4feec5] rounded-full animate-spin" />
          <p className="text-white text-lg">Connecting to Spotify...</p>
        </div>
      )}

      {generationError && !isGeneratingPlaylist && !generatedPlaylist && (() => {
        const isNetworkError = generationError.toLowerCase().includes("network") ||
          generationError.toLowerCase().includes("failed to fetch") ||
          generationError.toLowerCase().includes("figma");
        const isTimeout = generationError.toLowerCase().includes("timed out");
        return (
          <div className="fixed inset-0 bg-[#0a0b0d]/95 z-50 flex flex-col items-center justify-center gap-6 px-5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${
              isNetworkError ? "bg-yellow-500/10 border border-yellow-500/30" :
              isTimeout ? "bg-orange-500/10 border border-orange-500/30" :
              "bg-red-500/10 border border-red-500/30"
            }`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isNetworkError ? "#eab308" : isTimeout ? "#f97316" : "#ef4444"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-white text-xl font-semibold mb-2">
                {isNetworkError ? "Network unavailable" : isTimeout ? "Request timed out" : "Couldn't generate playlist"}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mb-2">{generationError}</p>
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              <button
                onClick={() => setGenerationError(null)}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
              >
                Dismiss
              </button>
              {!isNetworkError && (
                <button
                  onClick={() => { setGenerationError(null); generatePlaylist(playlistPrompt || "chill late night playlist"); }}
                  className="px-5 py-2.5 rounded-full bg-[#4feec5] hover:bg-[#3dd9b0] text-[#0a0b0d] text-sm font-semibold transition-colors"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {generatedPlaylist && (
        <AIPlaylistDisplay
          playlistData={generatedPlaylist}
          originalPrompt={playlistPrompt}
          onRegenerate={handleRegenerate}
          onEditPrompt={handleEditPrompt}
          onClose={handleClosePlaylist}
          spotifySessionId={spotifySessionId}
          onConnectSpotify={handleConnectSpotify}
          onDisconnectSpotify={handleDisconnectSpotify}
          projectId={projectId}
          publicAnonKey={publicAnonKey}
          isRegenerating={isRegenerating}
        />
      )}
    </div>
  );
}
