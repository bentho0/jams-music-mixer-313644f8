import { useState, useRef, useEffect, useCallback } from "react";
import { RotateCcw, Check, Pencil, ExternalLink, Music, Share2, Sparkles, ChevronDown, ChevronUp, ArrowUp, X, Copy, Edit2 } from "lucide-react";
import { isFigmaSandbox } from "@/utils/sandbox";
import { apiFetch, isSandboxError } from "@/utils/apiClient";

type ToastState = "hidden" | "checkin" | "success" | "help";

interface Track {
  spotify_track_id: string;
  track_name: string;
  artist: string;
  album?: string;
  reason: string;
  album_art: string;
  duration_ms: number;
  duration_formatted?: string;
  is_new: boolean;
  preview_url: string | null;
  spotify_url?: string | null;
}

interface PlaylistData {
  playlist_title: string;
  playlist_description: string;
  tracks: Track[];
  mood_tags: string[];
  audio_profile: {
    avg_tempo: number;
    avg_energy: number;
    avg_valence: number;
  };
}

interface AIPlaylistDisplayProps {
  playlistData: PlaylistData;
  originalPrompt: string;
  onRegenerate: () => void;
  onEditPrompt: () => void;
  onClose: () => void;
  spotifySessionId: string | null;
  onConnectSpotify: () => void;
  onDisconnectSpotify: () => void;
  projectId: string;
  publicAnonKey: string;
  isRegenerating?: boolean;
}

export function AIPlaylistDisplay({
  playlistData,
  originalPrompt,
  onRegenerate,
  onEditPrompt,
  onClose,
  spotifySessionId,
  onConnectSpotify,
  onDisconnectSpotify,
  projectId,
  publicAnonKey,
  isRegenerating = false,
}: AIPlaylistDisplayProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedPlaylistUrl, setSavedPlaylistUrl] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState("Copy Track List");
  const [showExportModal, setShowExportModal] = useState(false);
  const [dontShowExportModal, setDontShowExportModal] = useState(() =>
    localStorage.getItem("jams_skip_export_modal") === "true"
  );
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null);

  const [shareId] = useState(() => crypto.randomUUID());
  const [sharePersistedUrl, setSharePersistedUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareText, setShareText] = useState("I made this playlist for you 🎵");
  const [copyLinkText, setCopyLinkText] = useState("Copy Link");
  const [linkCopiedVisible, setLinkCopiedVisible] = useState(false);
  const linkCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [toastState, setToastState] = useState<ToastState>("hidden");
  const [toastVisible, setToastVisible] = useState(false);
  const [toastCopyText, setToastCopyText] = useState("Copy Track List Again");
  const tunemymusicOpenedRef = useRef(false);
  const toastDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [customCover, setCustomCover] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(playlistData.playlist_title);
  const [editDescription, setEditDescription] = useState(playlistData.playlist_description);
  const [displayTitle, setDisplayTitle] = useState(playlistData.playlist_title);
  const [displayDescription, setDisplayDescription] = useState(playlistData.playlist_description);

  const [refinementInput, setRefinementInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [shakeInput, setShakeInput] = useState(false);
  const [refinementHistory, setRefinementHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [livePlaylistData, setLivePlaylistData] = useState(playlistData);
  const [newTrackIds, setNewTrackIds] = useState<Set<string>>(new Set());
  const refinementInputRef = useRef<HTMLInputElement | null>(null);
  const refineErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const PLACEHOLDERS = [
    "Refine your playlist...",
    "Make it more melancholic...",
    "Remove the hip hop tracks...",
    "Push the energy higher...",
    "Add more 90s songs...",
    "Replace the last track...",
  ];
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!refinementInput) {
        setPlaceholderIndex(i => (i + 1) % PLACEHOLDERS.length);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [refinementInput]);

  const handleRefine = useCallback(async () => {
    const prompt = refinementInput.trim();
    if (!prompt) {
      setShakeInput(true);
      setTimeout(() => setShakeInput(false), 400);
      return;
    }
    if (isFigmaSandbox()) {
      setRefineError("Network is blocked in Figma's preview. Open the published URL to refine playlists.");
      refineErrorTimer.current = setTimeout(() => setRefineError(null), 5000);
      return;
    }
    if (refinementInputRef.current) {
      refinementInputRef.current.setAttribute('readonly', 'true');
      refinementInputRef.current.blur();
      setTimeout(() => refinementInputRef.current?.removeAttribute('readonly'), 100);
    }
    setIsRefining(true);
    setRefineError(null);
    if (refineErrorTimer.current) clearTimeout(refineErrorTimer.current);
    try {
      const response = await apiFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-d124bc75/refine-playlist`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            refinement_prompt: prompt,
            current_playlist: {
              title: livePlaylistData.playlist_title,
              tracks: livePlaylistData.tracks.map((t, i) => ({
                track_name: t.track_name,
                artist: t.artist,
                position: i + 1,
              })),
            },
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || "Refinement failed");

      const oldIds = new Set(livePlaylistData.tracks.map(t => t.spotify_track_id));
      const newIds = new Set<string>(
        (data.tracks as Array<{ spotify_track_id: string }>)
          .filter(t => t.spotify_track_id && !oldIds.has(t.spotify_track_id))
          .map(t => t.spotify_track_id)
      );
      setNewTrackIds(newIds);
      setLivePlaylistData(data);
      setRefinementHistory(h => [...h, prompt]);
      setRefinementInput("");
      setTimeout(() => setNewTrackIds(new Set()), 1500);
    } catch (err) {
      console.error("Refinement error:", err);
      setRefineError(
        isSandboxError(err)
          ? "Network is blocked in Figma's preview. Open the published URL to refine playlists."
          : "Couldn't update the playlist — try again"
      );
      refineErrorTimer.current = setTimeout(() => setRefineError(null), 4000);
    } finally {
      setIsRefining(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refinementInput, livePlaylistData, projectId, publicAnonKey]);

  useEffect(() => {
    setLivePlaylistData(playlistData);
    setNewTrackIds(new Set());
    setEditTitle(playlistData.playlist_title);
    setEditDescription(playlistData.playlist_description);
    setDisplayTitle(playlistData.playlist_title);
    setDisplayDescription(playlistData.playlist_description);
  }, [playlistData]);

  useEffect(() => {
    return () => {
      if (toastDismissTimer.current) clearTimeout(toastDismissTimer.current);
      if (linkCopiedTimer.current) clearTimeout(linkCopiedTimer.current);
      if (refineErrorTimer.current) clearTimeout(refineErrorTimer.current);
    };
  }, []);

  useEffect(() => {
    const id = shareId;
    const url = `${window.location.origin}/playlist/${id}`;
    setSharePersistedUrl(url);

    if (isFigmaSandbox()) return;

    fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-d124bc75/playlists/share`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          id,
          title: playlistData.playlist_title,
          description: playlistData.playlist_description,
          mood_tags: playlistData.mood_tags,
          tracks: playlistData.tracks,
          prompt: originalPrompt,
        }),
      }
    ).catch((err) => console.error("Failed to persist shared playlist:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeShareUrl = sharePersistedUrl ?? `${window.location.origin}/playlist/${shareId}`;

  const openShareModal = () => {
    setShowShareModal(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setShareModalVisible(true)));
  };
  const closeShareModal = () => {
    setShareModalVisible(false);
    setTimeout(() => setShowShareModal(false), 200);
  };

  const showLinkCopiedToast = () => {
    setLinkCopiedVisible(true);
    if (linkCopiedTimer.current) clearTimeout(linkCopiedTimer.current);
    linkCopiedTimer.current = setTimeout(() => setLinkCopiedVisible(false), 2000);
  };

  const handleShareButton = () => {
    openShareModal();
  };

  const buildFullShareText = () => `${shareText}\n\n${activeShareUrl}`;

  const handleCopyLink = async () => {
    try { await navigator.clipboard.writeText(activeShareUrl); }
    catch { fallbackCopy(activeShareUrl); }
    setCopyLinkText("✓ Link Copied!");
    showLinkCopiedToast();
    setTimeout(() => setCopyLinkText("Copy Link"), 2000);
  };

  const handleShareAsIs = async () => {
    try { await navigator.clipboard.writeText(shareText); }
    catch { fallbackCopy(shareText); }
    showLinkCopiedToast();
    closeShareModal();
  };

  const getSharePlatformLinks = () => {
    const fullText = buildFullShareText();
    const encodedText = encodeURIComponent(fullText);
    const encodedUrl = encodeURIComponent(activeShareUrl);
    return {
      whatsapp: `https://wa.me/?text=${encodedText}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      email: `mailto:?subject=${encodeURIComponent(displayTitle)}&body=${encodedText}`,
    };
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && tunemymusicOpenedRef.current) {
        tunemymusicOpenedRef.current = false;
        showCheckinToast();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const showCheckinToast = () => {
    setToastState("checkin");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setToastVisible(true));
    });
  };

  const dismissToast = (mode: "slide" | "fade" = "slide") => {
    if (toastDismissTimer.current) clearTimeout(toastDismissTimer.current);
    setToastVisible(false);
    setTimeout(() => setToastState("hidden"), mode === "fade" ? 150 : 300);
  };

  const handleToastSuccess = () => {
    if (toastDismissTimer.current) clearTimeout(toastDismissTimer.current);
    setToastVisible(false);
    setTimeout(() => {
      setToastState("success");
      requestAnimationFrame(() => requestAnimationFrame(() => setToastVisible(true)));
    }, 200);
  };

  const handleToastHelp = () => {
    if (toastDismissTimer.current) clearTimeout(toastDismissTimer.current);
    setToastState("help");
  };

  const handleToastCopyAgain = () => {
    const trackList = formatPlaylistForTunemymusic();
    try {
      navigator.clipboard.writeText(trackList).catch(() => fallbackCopy(trackList));
    } catch {
      fallbackCopy(trackList);
    }
    setToastCopyText("✓ Copied!");
    setTimeout(() => setToastCopyText("Copy Track List Again"), 2000);
  };

  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  };

  useEffect(() => {
    setDisplayTitle(livePlaylistData.playlist_title);
    setDisplayDescription(livePlaylistData.playlist_description);
  }, [livePlaylistData.playlist_title, livePlaylistData.playlist_description]);

  const totalDuration = livePlaylistData.tracks.reduce(
    (sum, track) => sum + (track.duration_ms || 0),
    0
  );
  const totalMinutes = Math.floor(totalDuration / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  const durationText =
    totalHours > 0
      ? `${totalHours} hr ${remainingMinutes} min`
      : `${totalMinutes} min`;

  const getMoodGradient = () => {
    const { avg_energy, avg_valence } = livePlaylistData.audio_profile;
    if (avg_energy > 0.6 && avg_valence > 0.6) return "from-orange-500/20 via-pink-500/20 to-purple-500/20";
    if (avg_energy < 0.4 && avg_valence < 0.4) return "from-blue-900/20 via-indigo-900/20 to-purple-900/20";
    if (avg_energy > 0.6 && avg_valence < 0.4) return "from-red-900/20 via-purple-900/20 to-blue-900/20";
    if (avg_energy < 0.4 && avg_valence > 0.6) return "from-cyan-500/20 via-teal-500/20 to-green-500/20";
    return "from-[#4feec5]/10 via-purple-500/10 to-blue-500/10";
  };

  const formatPlaylistForTunemymusic = () =>
    livePlaylistData.tracks.map(t => `${t.track_name} - ${t.artist}`).join("\n");

  const saveToAnyMusicApp = () => {
    const trackList = formatPlaylistForTunemymusic();
    try {
      navigator.clipboard.writeText(trackList).catch(() => fallbackCopy(trackList));
    } catch {
      fallbackCopy(trackList);
    }
    if (dontShowExportModal) {
      const encodedTracks = encodeURIComponent(formatPlaylistForTunemymusic());
      const encodedTitle = encodeURIComponent(displayTitle);
      window.open(`https://www.tunemymusic.com/transfer?source=text&playlistName=${encodedTitle}&songs=${encodedTracks}`, "_blank");
      tunemymusicOpenedRef.current = true;
    } else {
      setShowExportModal(true);
    }
  };

  const openTunemymusic = () => {
    const encodedTracks = encodeURIComponent(formatPlaylistForTunemymusic());
    const encodedTitle = encodeURIComponent(displayTitle);
    const url = `https://www.tunemymusic.com/transfer?source=text&playlistName=${encodedTitle}&songs=${encodedTracks}`;
    window.open(url, "_blank");
    tunemymusicOpenedRef.current = true;
    setShowExportModal(false);
  };

  const copyTrackList = async () => {
    const trackList = formatPlaylistForTunemymusic();
    try {
      await navigator.clipboard.writeText(trackList);
    } catch {
      fallbackCopy(trackList);
    }
    setCopyButtonText("✓ Copied!");
    setTimeout(() => setCopyButtonText("Copy Track List"), 2000);
  };

  const handlePlayOnSpotify = async () => {
    if (!spotifySessionId) {
      setIsConnecting(true);
      try {
        await onConnectSpotify();
      } catch {
        setIsConnecting(false);
      }
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSavedPlaylistUrl(null);

    try {
      const trackIds = livePlaylistData.tracks
        .map(t => t.spotify_track_id)
        .filter(Boolean);

      const response = await apiFetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-d124bc75/spotify/save-playlist`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            sessionId: spotifySessionId,
            title: displayTitle,
            description: displayDescription,
            trackIds,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'invalid_session' || data.error === 'reconnect_required') {
          onDisconnectSpotify();
          setSaveError('Your Spotify session expired. Please connect again.');
        } else {
          throw new Error(data.message || data.error || 'Failed to save playlist');
        }
        setIsSaving(false);
        return;
      }

      setIsSaved(true);
      setSavedPlaylistUrl(data.playlistUrl || null);
    } catch (error) {
      console.error('Error saving playlist to Spotify:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save playlist');
    } finally {
      setIsSaving(false);
    }
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-[#0a0b0d] z-50 overflow-y-auto">
      <button
        onClick={onClose}
        className="fixed top-5 right-5 text-white/50 hover:text-white transition-colors z-[60]"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="max-w-5xl mx-auto px-5 md:px-6 py-10 md:py-12">
        {/* Playlist Header */}
        <div className="relative mb-12 mt-3">
          <div className={`absolute inset-0 bg-gradient-to-br ${getMoodGradient()} blur-3xl opacity-50 -z-10`} />
          <div className="bg-white/5 backdrop-blur-xl rounded-3xl p-5 md:p-10 border-[0.5px] border-[#2A3432]">
            <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
              {/* Playlist Cover */}
              <div
                className="group w-40 h-40 aspect-square md:w-48 md:h-48 md:aspect-auto md:flex-shrink-0 rounded-lg overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.6)] self-center md:self-start relative cursor-pointer"
                onClick={() => coverInputRef.current?.click()}
              >
                <input
                  id="playlist-cover-upload"
                  name="cover-image"
                  type="file"
                  ref={coverInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => setCustomCover(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />

                {customCover ? (
                  <img src={customCover} alt="Custom playlist cover" className="w-full h-full object-cover" />
                ) : (() => {
                  const artworks = livePlaylistData.tracks
                    .filter(t => t.album_art)
                    .map(t => t.album_art)
                    .filter((url, i, arr) => arr.indexOf(url) === i)
                    .slice(0, 4);

                  if (artworks.length === 0) {
                    return (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center">
                        <svg className="w-16 h-16 text-white/20" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                        </svg>
                      </div>
                    );
                  }

                  if (artworks.length < 4) {
                    return <img src={artworks[0]} alt="Playlist cover" className="w-full h-full object-cover" />;
                  }

                  return (
                    <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                      {artworks.map((url, i) => (
                        <img key={i} src={url} alt="" className="w-full h-full object-cover" />
                      ))}
                    </div>
                  );
                })()}

                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-200 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <Pencil className="w-7 h-7 text-white drop-shadow-lg" />
                  <span className="text-white text-sm font-semibold tracking-wide drop-shadow-lg">Edit Cover</span>
                </div>
              </div>

              {/* Playlist Info */}
              <div className="flex-1 min-w-0">
                <button
                  className="group/title text-left w-full mb-3"
                  onClick={() => {
                    setEditTitle(displayTitle);
                    setEditDescription(displayDescription);
                    setIsEditModalOpen(true);
                  }}
                >
                  <h1 className="font-bold text-white leading-tight group-hover/title:underline decoration-white/40 underline-offset-4 transition-all text-[24px]">
                    {displayTitle}
                  </h1>
                </button>

                <button
                  className="group/desc text-left w-full mb-5"
                  onClick={() => {
                    setEditTitle(displayTitle);
                    setEditDescription(displayDescription);
                    setIsEditModalOpen(true);
                  }}
                >
                  <p className="text-white/70 leading-relaxed group-hover/desc:text-white/90 transition-colors text-[14px]">
                    {displayDescription || <span className="italic text-white/30">Add a description…</span>}
                  </p>
                </button>

                <div className="flex items-center gap-4 text-white/40 mb-7">
                  <span className="text-sm">{livePlaylistData.tracks.length} songs</span>
                  <span className="text-sm">•</span>
                  <span className="text-sm">{durationText}</span>
                </div>

                <div className="flex flex-col md:flex-row md:items-start gap-5 md:gap-3">
                  <div className="flex flex-col gap-1.5 w-full md:w-fit">
                    <button
                      onClick={saveToAnyMusicApp}
                      className="flex items-center justify-center gap-2.5 px-6 py-3 md:px-7 md:py-3.5 rounded-lg bg-[#4feec5] hover:bg-[#3fd9b5] text-[#0a0b0d] font-semibold transition-all w-full"
                    >
                      <Music className="w-5 h-5 flex-shrink-0" />
                      <span className="whitespace-nowrap">Save This Playlist</span>
                      <ExternalLink className="w-4 h-4 flex-shrink-0 opacity-60" />
                    </button>
                    <p className="text-white/70 text-xs text-left leading-relaxed">You'll be taken to Tunemymusic to complete the save.<br />It's free and takes less than a minute.</p>
                  </div>

                  <button
                    onClick={handleShareButton}
                    className="flex items-center justify-center gap-2 px-5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-all border-[0.5px] border-[#2A3432] w-full md:w-auto" style={{height: '52px'}}
                  >
                    <Share2 className="w-5 h-5" />
                    <span className="whitespace-nowrap">Share Playlist</span>
                  </button>

                  <button
                    onClick={isRegenerating ? undefined : onRegenerate}
                    disabled={isRegenerating}
                    className="flex items-center justify-center gap-2 px-4 md:px-0 py-3 md:py-3.5 rounded-lg text-white/50 hover:text-white font-semibold transition-all w-full md:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className={`w-5 h-5 ${isRegenerating ? "animate-spin" : ""}`} />
                    <span className="text-[#ffffffcc]">{isRegenerating ? "Regenerating…" : "Regenerate"}</span>
                  </button>
                </div>

                {saveError && (
                  <p className="mt-3 text-red-400 text-sm flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {saveError}
                  </p>
                )}

                {isSaved && savedPlaylistUrl && (
                  <a
                    href={savedPlaylistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-[#4feec5] text-sm hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in Spotify
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border-[0.5px] border-[#2A3432] overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b-[0.5px] border-[#2A3432]">
            <h2 className="text-white font-semibold text-lg">Tracks</h2>
          </div>

          <div className="divide-y divide-[#2A3432]">
            {livePlaylistData.tracks.map((track, index) => {
              const isNew = newTrackIds.has(track.spotify_track_id);
              const trackKey = track.spotify_track_id || `fallback-${index}-${track.track_name}`;
              return (
                <div
                  key={trackKey}
                  className={`px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4 transition-all duration-300 ${
                    isRefining ? "animate-pulse" : ""
                  } ${
                    isNew ? "bg-[#4feec5]/5 border-l-2 border-[#4feec5]" :
                    hoveredTrack === index ? "bg-white/10" : "bg-transparent hover:bg-white/5"
                  }`}
                  style={isNew ? { animation: "fadeInTrack 0.4s ease forwards" } : {}}
                  onMouseEnter={() => setHoveredTrack(index)}
                  onMouseLeave={() => setHoveredTrack(null)}
                >
                  <div className="w-6 md:w-8 text-center flex-shrink-0 hidden sm:block">
                    {isRefining ? (
                      <div className="w-5 h-4 bg-white/10 rounded animate-pulse mx-auto" />
                    ) : (
                      <span className="text-white/40 text-sm">{index + 1}</span>
                    )}
                  </div>

                  <div className="w-12 h-12 bg-white/10 rounded-md overflow-hidden flex-shrink-0 relative">
                    {isRefining ? (
                      <div className="w-full h-full bg-white/10 animate-pulse" />
                    ) : track.album_art ? (
                      <img
                        src={track.album_art}
                        alt={track.album || "Album"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-white/20" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {isRefining ? (
                      <>
                        <div className="h-4 bg-white/10 rounded animate-pulse w-3/4 mb-2" />
                        <div className="h-3 bg-white/10 rounded animate-pulse w-1/2" />
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate text-white">{track.track_name}</p>
                          {isNew && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#4feec5]/20 text-[#4feec5] text-xs flex-shrink-0 font-medium">new</span>
                          )}
                        </div>
                        <p className="text-white/60 text-sm truncate">{track.artist}</p>
                      </>
                    )}
                  </div>

                  <div className="text-white/40 text-sm flex-shrink-0 hidden sm:block">
                    {isRefining ? (
                      <div className="h-3 bg-white/10 rounded animate-pulse w-10" />
                    ) : (
                      track.duration_formatted || (track.duration_ms ? formatDuration(track.duration_ms) : "—")
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-12" />
      </div>

      {/* Sticky AI Refinement Bar */}
      <div className="sticky bottom-0 z-40 pb-safe">
        <div className="max-w-5xl mx-auto px-5 md:px-6 pb-4">
          {refinementHistory.length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => setShowHistory(h => !h)}
                className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs transition-colors mb-1.5"
              >
                {showHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                Recent adjustments
              </button>
              {showHistory && (
                <div className="flex flex-wrap gap-1.5">
                  {refinementHistory.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setRefinementInput(item);
                        refinementInputRef.current?.focus();
                      }}
                      className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs transition-all border-[0.5px] border-[#2A3432]"
                    >
                      "{item}"
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {refineError && (
            <div className="mb-2 text-center">
              <span className="text-red-400/80 text-xs">{refineError}</span>
            </div>
          )}

          <div
            className={`flex items-center gap-3 h-14 bg-[#1a1b20]/95 backdrop-blur-xl border rounded-2xl px-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)] transition-all ${
              shakeInput ? "border-[#2A3432] animate-[shake_0.3s_ease]" : "border-[#2A3432] focus-within:border-[#4feec5]/50"
            }`}
          >
            <Sparkles className="w-5 h-5 text-[#4feec5] flex-shrink-0" />

            <input
              id="refinement-input"
              name="refinement"
              ref={refinementInputRef}
              type="text"
              value={refinementInput}
              onChange={e => setRefinementInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !isRefining && handleRefine()}
              disabled={isRefining}
              placeholder={PLACEHOLDERS[placeholderIndex]}
              className="flex-1 bg-transparent text-white placeholder-white/30 text-sm focus:outline-none disabled:opacity-50"
            />

            <button
              onClick={handleRefine}
              disabled={isRefining}
              className="w-9 h-9 rounded-md bg-[#4feec5] hover:bg-[#3fd9b5] flex items-center justify-center text-[#0a0b0d] transition-all flex-shrink-0 disabled:opacity-60 shadow-[0_0_16px_rgba(79,238,197,0.4)]"
            >
              {isRefining ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInTrack {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25%       { transform: translateX(-4px); }
          75%       { transform: translateX(4px); }
        }
      `}</style>

      {/* Edit Playlist Details Modal */}
      {isEditModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setIsEditModalOpen(false); }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-[#1a1b20] rounded-2xl shadow-2xl border-[0.5px] border-[#2A3432] overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b-[0.5px] border-[#2A3432]">
              <h2 className="text-white font-bold text-lg">Edit playlist details</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-white/50 text-xs font-semibold uppercase tracking-widest mb-2">Name</label>
                <input
                  id="edit-playlist-title"
                  name="playlist-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={100}
                  autoFocus
                  placeholder="Give your playlist a name"
                  className="w-full bg-white/5 border-[0.5px] border-[#2A3432] rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#4feec5]/60 transition-all"
                />
              </div>
              <div>
                <label className="block text-white/50 text-xs font-semibold uppercase tracking-widest mb-2">Description</label>
                <textarea
                  id="edit-playlist-description"
                  name="playlist-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={300}
                  rows={4}
                  placeholder="Add an optional description"
                  className="w-full bg-white/5 border-[0.5px] border-[#2A3432] rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#4feec5]/60 transition-all resize-none"
                />
                <p className="text-right text-white/20 text-xs mt-1">{editDescription.length}/300</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setIsEditModalOpen(false)} className="px-5 py-2.5 rounded-lg text-white/60 hover:text-white text-sm font-medium transition-colors">Cancel</button>
              <button
                onClick={() => {
                  if (editTitle.trim()) {
                    setDisplayTitle(editTitle.trim());
                    setDisplayDescription(editDescription.trim());
                  }
                  setIsEditModalOpen(false);
                }}
                className="px-6 py-2.5 rounded-lg bg-[#4feec5] hover:bg-[#3fd9b5] text-[#0a0b0d] text-sm font-bold transition-all shadow-[0_0_20px_rgba(79,238,197,0.3)]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowExportModal(false); }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-[#1a1b20] rounded-2xl shadow-2xl border-[0.5px] border-[#2A3432] overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b-[0.5px] border-[#2A3432] flex-shrink-0">
              <h2 className="text-white font-bold text-lg">Almost there — save your playlist</h2>
              <button onClick={() => setShowExportModal(false)} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5 overflow-y-auto">
              <div className="flex items-center gap-3 bg-[#4feec5]/10 border-[0.5px] border-[#2A3432] rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-[#4feec5]/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-[#4feec5]" />
                </div>
                <div>
                  <p className="text-[#4feec5] text-sm font-semibold">Track list copied to clipboard</p>
                  <p className="text-[#4feec5]/60 text-xs mt-0.5">{livePlaylistData.tracks.length} songs loaded and ready to go</p>
                </div>
              </div>
              <div className="space-y-3.5">
                <p className="text-white/40 text-xs font-semibold uppercase tracking-widest">Complete your save on Tunemymusic</p>
                {[
                  { step: "1", label: <>Select <span className="text-white font-semibold">"Free Text"</span> as your source</> },
                  { step: "2", label: <>Paste your track list — it's already in your clipboard</> },
                  { step: "3", label: <>Choose where to save it — Spotify, Apple Music, YouTube Music, and more</> },
                  { step: "4", label: <>Hit <span className="text-white font-semibold">Transfer</span> — your playlist will be built in seconds ✓</> },
                ].map(({ step, label }) => (
                  <div key={step} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-white/10 text-white/50 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</span>
                    <p className="text-white/70 text-sm leading-relaxed">{label}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  const next = !dontShowExportModal;
                  setDontShowExportModal(next);
                  localStorage.setItem("jams_skip_export_modal", String(next));
                }}
                className="flex items-center gap-2.5 group"
              >
                <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all flex-shrink-0 ${
                  dontShowExportModal ? "bg-[#4feec5] border-[#4feec5]" : "border-[#2A3432] bg-white/5 group-hover:border-[#2A3432]"
                }`}>
                  {dontShowExportModal && (
                    <svg className="w-2.5 h-2.5 text-[#0a0b0d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-white/40 text-xs group-hover:text-white/60 transition-colors">Don't show this again</span>
              </button>
            </div>
            <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowExportModal(false)} className="px-5 py-2.5 rounded-lg text-white/60 hover:text-white text-sm font-medium transition-colors sm:w-auto w-full text-center">Cancel</button>
              <button
                onClick={openTunemymusic}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-[#4feec5] hover:bg-[#3fd9b5] text-[#0a0b0d] text-sm font-bold transition-all shadow-[0_0_20px_rgba(79,238,197,0.3)] sm:w-auto w-full"
              >
                <ExternalLink className="w-4 h-4" />
                Open Tunemymusic →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (() => {
        const platforms = getSharePlatformLinks();
        return (
          <div
            className="fixed inset-0 z-[65] flex items-center justify-center p-4"
            style={{ opacity: shareModalVisible ? 1 : 0, transition: "opacity 200ms ease" }}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeShareModal} />
            <div
              className="relative w-full max-w-[460px] bg-[#1a1b20] border-[0.5px] border-[#2A3432] rounded-2xl shadow-2xl overflow-hidden"
              style={{
                transform: shareModalVisible ? "scale(1) translateY(0)" : "scale(0.96) translateY(12px)",
                transition: "transform 200ms ease",
              }}
            >
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b-[0.5px] border-[#2A3432]">
                <h2 className="text-white font-bold text-lg">Share this playlist</h2>
                <button onClick={closeShareModal} className="text-white/40 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <label className="block text-white/40 text-xs mb-2">✏️ Your message</label>
                  <textarea
                    id="share-message"
                    name="share-message"
                    value={shareText}
                    onChange={(e) => setShareText(e.target.value)}
                    rows={2}
                    className="w-full bg-white/5 border-[0.5px] border-[#2A3432] rounded-lg px-4 py-3 text-white/80 text-sm leading-relaxed focus:outline-none focus:border-[#4feec5]/50 transition-all resize-none"
                  />
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {[
                    { key: "whatsapp", label: "WhatsApp", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> },
                    { key: "twitter", label: "Twitter/X", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                    { key: "telegram", label: "Telegram", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg> },
                    { key: "facebook", label: "Facebook", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
                    { key: "email", label: "Email", icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> },
                  ].map(({ key, label, icon }) => (
                    <a
                      key={key}
                      href={platforms[key as keyof typeof platforms]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all border-[0.5px] border-[#2A3432] hover:border-[#2A3432]"
                    >
                      {icon}
                      <span className="text-[10px] text-white/50">{label}</span>
                    </a>
                  ))}
                </div>
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border-[0.5px] border-[#2A3432] hover:border-[#2A3432] text-white/80 text-sm font-medium transition-all"
                >
                  {copyLinkText === "✓ Link Copied!" ? <Check className="w-4 h-4 text-[#4feec5]" /> : <Copy className="w-4 h-4" />}
                  <span className={copyLinkText === "✓ Link Copied!" ? "text-[#4feec5]" : ""}>{copyLinkText}</span>
                </button>
                <p className="text-white/25 text-xs text-center">
                  For Instagram: copy the link and paste it into your post or story caption
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Copy link confirmation toast */}
      <div
        className="fixed bottom-6 left-1/2 z-[80] pointer-events-none"
        style={{
          transform: `translateX(-50%) translateY(${linkCopiedVisible ? "0" : "20px"})`,
          opacity: linkCopiedVisible ? 1 : 0,
          transition: "all 200ms ease",
        }}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1b20] border-[0.5px] border-[#2A3432] rounded-xl shadow-xl text-white text-sm font-medium whitespace-nowrap">
          <Check className="w-4 h-4 text-[#4feec5]" />
          ✓ Link copied to clipboard
        </div>
      </div>

      {/* Return-flow Toast */}
      {toastState !== "hidden" && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{
            opacity: toastVisible ? 1 : 0,
            transition: "opacity 200ms ease",
          }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => dismissToast("fade")} />
          <div className="relative w-full max-w-[420px] bg-[#1a1b20] border-[0.5px] border-[#2A3432] rounded-2xl shadow-2xl overflow-hidden"
            style={{
              transform: toastVisible ? "scale(1) translateY(0)" : "scale(0.96) translateY(12px)",
              transition: "transform 200ms ease",
            }}
          >
            {toastState === "checkin" && (
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-white font-semibold leading-snug text-[16px]">Did your playlist save successfully?</p>
                  <button onClick={() => dismissToast("fade")} className="ml-3 text-white/30 hover:text-white/70 transition-colors flex-shrink-0 -mt-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-3 flex-col sm:flex-row">
                  <button onClick={handleToastSuccess} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#4feec5] hover:bg-[#3fd9b5] text-[#0a0b0d] text-sm font-bold transition-all">
                    <Check className="w-4 h-4" />
                    Yes, it worked
                  </button>
                  <button onClick={handleToastHelp} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-[0.5px] border-[#2A3432] text-white/70 hover:text-white hover:border-[#2A3432] text-sm font-medium transition-all">
                    <X className="w-4 h-4" />
                    I had trouble
                  </button>
                </div>
              </div>
            )}

            {toastState === "success" && (
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-white font-semibold leading-snug text-[16px]">🎵 Amazing — enjoy the playlist!</p>
                  <button onClick={() => dismissToast("fade")} className="ml-3 text-white/30 hover:text-white/70 transition-colors flex-shrink-0 -mt-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-3 flex-col sm:flex-row">
                  <button onClick={() => { dismissToast("fade"); onClose(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#4feec5] hover:bg-[#3fd9b5] text-[#0a0b0d] font-bold transition-all whitespace-nowrap text-[14px] text-center">
                    <RotateCcw className="w-4 h-4 shrink-0" />
                    Generate New Playlist
                  </button>
                  <button onClick={() => { dismissToast("fade"); onEditPrompt(); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-[0.5px] border-[#2A3432] text-white/70 hover:text-white hover:border-[#2A3432] text-sm font-medium transition-all">
                    <Edit2 className="w-4 h-4" />
                    Tweak This One
                  </button>
                </div>
              </div>
            )}

            {toastState === "help" && (
              <div className="p-5" style={{ transition: "height 250ms ease-in-out" }}>
                <div className="flex items-start justify-between mb-4">
                  <p className="text-white font-semibold text-sm">No worries — here's what to try:</p>
                  <button onClick={() => dismissToast("fade")} className="ml-3 text-white/30 hover:text-white/70 transition-colors flex-shrink-0 -mt-0.5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ul className="space-y-2.5 mb-5">
                  {[
                    <>Make sure you selected <span className="text-white font-medium">"Free Text"</span> as the source on Tunemymusic</>,
                    <>Your track list is still in your clipboard — try pasting again</>,
                    <>If Tunemymusic isn't working, use the <span className="text-white font-medium">Copy Track List</span> option below</>,
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-white/60 text-xs leading-relaxed">
                      <span className="w-1 h-1 rounded-full bg-white/30 flex-shrink-0 mt-1.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-3 flex-col sm:flex-row">
                  <button onClick={() => { openTunemymusic(); dismissToast("fade"); }} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#4feec5] hover:bg-[#3fd9b5] text-[#0a0b0d] text-sm font-bold transition-all">
                    <ExternalLink className="w-4 h-4" />
                    Re-open Tunemymusic
                  </button>
                  <button onClick={handleToastCopyAgain} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-[0.5px] border-[#2A3432] text-white/70 hover:text-white hover:border-[#2A3432] text-sm font-medium transition-all">
                    {toastCopyText === "✓ Copied!" ? <Check className="w-4 h-4 text-[#4feec5]" /> : <Copy className="w-4 h-4" />}
                    <span className={toastCopyText === "✓ Copied!" ? "text-[#4feec5]" : ""}>{toastCopyText}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
