// AI-Powered Playlist Recommendation Engine
// Architecture: OpenAI selects tracks → Spotify resolves metadata

// ─── Types ────────────────────────────────────────────────────────────────────

interface AITrack {
  position: number;
  track: string;
  artist: string;
  year: number;
  tier: string;
  mood_fit: string;
}

interface AIPlaylistResponse {
  playlist_title: string;
  playlist_description: string;
  mood_tags: string[];
  energy_level: number;
  track_count: number;
  tracks: AITrack[];
}

interface ResolvedTrack {
  spotify_track_id: string;
  track_name: string;
  artist: string;
  album: string;
  reason: string;
  album_art: string;
  duration_ms: number;
  duration_formatted: string;
  is_new: boolean;
  preview_url: string | null;
  spotify_url: string | null;
}

export interface RecommendationResult {
  playlist_title: string;
  playlist_description: string;
  tracks: ResolvedTrack[];
  mood_tags: string[];
  audio_profile: {
    avg_tempo: number;
    avg_energy: number;
    avg_valence: number;
  };
}

// ─── Spotify token (module-level cache) ──────────────────────────────────────

let _token: string | null = null;
let _tokenExpiresAt = 0;

async function getSpotifyToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt - 60_000) {
    return _token;
  }

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')?.trim();

  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not configured');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Spotify token fetch failed (${res.status}): ${text}`);
  }

  const data = JSON.parse(text);
  if (!data.access_token) {
    throw new Error(`Spotify token response missing access_token: ${text}`);
  }

  _token = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  console.log(`✅ Spotify token obtained (expires in ${data.expires_in}s)`);
  return _token as string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function cleanTrackName(name: string): string {
  return name
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(ft\..*?\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?remix.*?\)/gi, '')
    .replace(/\(.*?remaster.*?\)/gi, '')
    .replace(/\(.*?live.*?\)/gi, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArtistName(name: string): string {
  return name
    .replace(/&.*/, '')
    .replace(/,.*/, '')
    .replace(/feat\..*$/gi, '')
    .replace(/ft\..*$/gi, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveAudioProfile(playlist: AIPlaylistResponse) {
  const e = (playlist.energy_level || 5) / 10;
  const moodText = (playlist.mood_tags || []).join(' ').toLowerCase();
  const isNegative = ['sad', 'melanchol', 'grief', 'dark', 'angry', 'tense', 'lonely', 'heartbreak'].some(m => moodText.includes(m));
  return {
    avg_tempo: Math.round(80 + e * 80),
    avg_energy: Math.round(e * 100) / 100,
    avg_valence: isNegative ? Math.max(0.1, e * 0.4) : Math.min(1.0, e * 0.7 + 0.3),
  };
}

// ─── Spotify search ───────────────────────────────────────────────────────────

async function searchSpotify(trackName: string, artistName: string, token: string): Promise<any | null> {

  // Run a single Spotify search query, return the best matching item or null
  const attemptSearch = async (q: string): Promise<any | null> => {
    console.log(`  → Trying: "${q}"`);
    // market=US is required — without it Spotify silently returns empty items for many tracks
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5&market=US`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch (networkErr: any) {
      console.error(`  ❌ Network error during Spotify search for "${q}":`, networkErr.message);
      return null;
    }

    console.log(`  ← Spotify HTTP ${res.status} for: "${q}"`);

    if (res.status === 401) {
      throw Object.assign(new Error('Spotify 401'), { status: 401 });
    }

    if (res.status === 429) {
      // Rate limited — wait then fall through to next strategy rather than retrying the same query
      const retryAfter = Number(res.headers.get('Retry-After') || '2');
      console.warn(`  ⚠️ Rate limited — waiting ${retryAfter}s before next strategy`);
      await sleep(retryAfter * 1000);
      return null; // caller will try the next strategy
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`  ⚠️ Spotify search HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }

    let data: any;
    try {
      data = await res.json();
    } catch (parseErr: any) {
      console.error(`  ❌ Failed to parse Spotify response JSON:`, parseErr.message);
      return null;
    }

    const items: any[] = data?.tracks?.items || [];
    console.log(`  ← items returned: ${items.length}`);
    if (!items.length) return null;

    // Prefer a result that has album art and duration
    return items.find((t: any) => t.album?.images?.length > 0 && t.duration_ms > 0) || items[0];
  };

  // 3 strategies in order: full natural → track only → cleaned names
  const strategies = [
    `${trackName} ${artistName}`,
    `${trackName}`,
    `${cleanTrackName(trackName)} ${cleanArtistName(artistName)}`,
  ];

  try {
    for (const query of strategies) {
      const result = await attemptSearch(query);
      if (result) {
        console.log(`✅ "${result.name}" by ${result.artists?.[0]?.name} | strategy: "${query}" | ${result.duration_ms}ms | art: ${result.album?.images?.[1]?.url ? 'OK' : 'none'}`);
        return result;
      }
      console.log(`  ✗ No match for: "${query}"`);
    }

    console.warn(`⚠️ Not found on Spotify after all strategies: "${trackName}" by "${artistName}"`);
    return null;
  } catch (err: any) {
    if (err.status === 401) {
      console.log('🔄 Refreshing Spotify token after 401...');
      _token = null;
      _tokenExpiresAt = 0;
      try {
        const freshToken = await getSpotifyToken();
        return searchSpotify(trackName, artistName, freshToken);
      } catch (refreshErr: any) {
        console.error('❌ Token refresh failed:', refreshErr.message);
        return null;
      }
    }
    console.error(`❌ Search error for "${trackName}" by "${artistName}":`, err.message);
    return null;
  }
}

// ─── Resolve all AI tracks → Spotify metadata ─────────────────────────────────

// Per-search timeout wrapper — a single slow/hung Spotify request won't block the whole playlist
async function searchSpotifyWithTimeout(
  trackName: string,
  artistName: string,
  token: string,
  timeoutMs = 6000
): Promise<any | null> {
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
  const result = await Promise.race([searchSpotify(trackName, artistName, token), timeout]);
  if (!result) {
    console.warn(`⏱️ Search timeout (${timeoutMs}ms): "${trackName}" by "${artistName}"`);
  }
  return result;
}

async function resolveTracks(
  aiTracks: AITrack[],
  token: string,
  originalTrackKeys?: Set<string>
): Promise<ResolvedTrack[]> {
  console.log(`🔍 Resolving ${aiTracks.length} tracks on Spotify in parallel...`);

  // All searches run simultaneously — no batching, no inter-batch sleeps.
  // Each search has a 6s per-track timeout so one slow result never blocks the rest.
  const results = await Promise.all(aiTracks.map(async (aiTrack) => {
    const spotifyTrack = await searchSpotifyWithTimeout(aiTrack.track, aiTrack.artist, token, 6000);

    let isNew = false;
    if (originalTrackKeys) {
      const key = spotifyTrack
        ? `${spotifyTrack.name.toLowerCase()}::${spotifyTrack.artists?.[0]?.name?.toLowerCase() || ''}`
        : `${aiTrack.track.toLowerCase()}::${aiTrack.artist.toLowerCase()}`;
      isNew = !originalTrackKeys.has(key);
    }

    if (spotifyTrack) {
      return mapTrack(spotifyTrack, aiTrack, isNew);
    }

    console.warn(`⚠️ Fallback (no Spotify match): "${aiTrack.track}" by ${aiTrack.artist}`);
    return fallbackTrack(aiTrack, isNew);
  }));

  // Deduplicate by spotify_track_id (keep first occurrence)
  const seen = new Set<string>();
  const deduped = results.filter(t => {
    const key = t.spotify_track_id || `fallback::${t.track_name}::${t.artist}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length < results.length) {
    console.log(`🔁 Removed ${results.length - deduped.length} duplicate(s)`);
  }

  const matched = deduped.filter(t => t.spotify_track_id).length;
  console.log(`✅ Resolved: ${matched}/${aiTracks.length} matched on Spotify, ${deduped.length - matched} fallback(s)`);

  return deduped;
}

// ─── Map a Spotify track object → ResolvedTrack ───────────────────────────────

function mapTrack(spotifyTrack: any, aiTrack: AITrack, isNew: boolean): ResolvedTrack {
  // images[1] = 300px (preferred), images[0] = 640px, images[2] = 64px
  const albumArt =
    spotifyTrack.album?.images?.[1]?.url ||
    spotifyTrack.album?.images?.[0]?.url ||
    spotifyTrack.album?.images?.[2]?.url ||
    '';

  return {
    spotify_track_id: spotifyTrack.id || '',
    track_name: spotifyTrack.name || aiTrack.track,
    artist: spotifyTrack.artists?.map((a: any) => a.name).join(', ') || aiTrack.artist,
    album: spotifyTrack.album?.name || '',
    reason: aiTrack.mood_fit || '',
    album_art: albumArt,
    duration_ms: spotifyTrack.duration_ms || 0,
    duration_formatted: formatDuration(spotifyTrack.duration_ms || 0),
    is_new: isNew,
    preview_url: spotifyTrack.preview_url || null,
    spotify_url: spotifyTrack.external_urls?.spotify || null,
  };
}

function fallbackTrack(aiTrack: AITrack, isNew: boolean): ResolvedTrack {
  return {
    spotify_track_id: '',
    track_name: aiTrack.track,
    artist: aiTrack.artist,
    album: '',
    reason: aiTrack.mood_fit || '',
    album_art: '',
    duration_ms: 0,
    duration_formatted: '0:00',
    is_new: isNew,
    preview_url: null,
    spotify_url: null,
  };
}

// ─── OpenAI: generate playlist ────────────────────────────────────────────────

async function callOpenAI(systemPrompt: string, userMessage: string, maxTokens = 3000): Promise<AIPlaylistResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.85,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned empty content');

  // Strip markdown fences just in case
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let parsed: AIPlaylistResponse;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('❌ Failed to parse OpenAI JSON:', cleaned.slice(0, 500));
    throw new Error('Failed to parse OpenAI JSON response');
  }

  // Normalize field names — model sometimes uses track_name instead of track
  if (parsed.tracks) {
    parsed.tracks = parsed.tracks.map((t: any) => ({
      ...t,
      track: t.track || t.track_name || t.name || '',
      artist: t.artist || t.artist_name || '',
    }));
  }

  if (!parsed.tracks || parsed.tracks.length === 0) {
    throw new Error('OpenAI returned 0 tracks');
  }

  console.log(`🎵 OpenAI returned ${parsed.tracks.length} tracks for "${parsed.playlist_title}"`);
  return parsed;
}

// ─── System prompts ──────────────────────────────────────────��────────────────

/** Parse how many tracks the user explicitly requested (capped at 25, default 12). */
function parseRequestedTrackCount(prompt: string): number {
  const lower = prompt.toLowerCase();

  // Explicit song/track count: "20 songs", "15 tracks", "a 25-song playlist"
  const countMatch = lower.match(/(\d+)\s*(?:song|track|tune)s?/);
  if (countMatch) {
    return Math.min(Math.max(parseInt(countMatch[1], 10), 5), 25);
  }

  // Duration hint: "2 hour", "90 minute", "1.5 hour" → assume ~3.5 min/track avg
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr)s?/);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    return Math.min(Math.round((hours * 60) / 3.5), 25);
  }

  const minuteMatch = lower.match(/(\d+)\s*min(?:ute)?s?/);
  if (minuteMatch) {
    const mins = parseInt(minuteMatch[1], 10);
    if (mins >= 30) return Math.min(Math.round(mins / 3.5), 25);
  }

  return 12; // default
}

function buildGenerationPrompt(trackCount: number): string {
  const anchorCount  = Math.round(trackCount * 0.30);
  const midCount     = Math.round(trackCount * 0.40);
  const deepCutCount = trackCount - anchorCount - midCount;

  return `You are an expert music curator with deep knowledge of songs across all genres, eras, languages, and cultures. 
Your job is to generate highly specific, thoughtful, and varied playlist recommendations based on the user's prompt.

═══════════════════════════════════════════════════════════════════════════════
CORE RULES — FOLLOW THESE WITHOUT EXCEPTION:
═══════════════════════════════════════════════════════════════════════════════

1. NEVER repeat songs across playlists in the same session
2. NEVER default to the same popular/obvious artists (no always recommending Drake, Taylor Swift, The Weeknd, etc. unless the prompt specifically calls for them or the user asks for popular music)
3. ALWAYS return EXACTLY ${trackCount} tracks — no more, no fewer
4. NEVER pad the list with filler — every track must genuinely fit the prompt
5. NEVER recommend a song just because it's famous. Recommend it because it fits.
6. Every track must be a REAL song verifiable on Spotify (use actual release years)

═══════════════════════════════════════════════════════════════════════════════
VARIANCE RULES — FIGHT REPETITION ACTIVELY:
═══════════════════════════════════════════════════════════════════════════════

Before generating any playlist, internally check:
- Have I recommended this song in this session before? If yes, replace it.
- Are more than 2 tracks from the same artist? If yes, reduce to max 2 unless the prompt is artist-specific.
- Are more than 3 tracks from the same decade? If yes, diversify the era spread unless the prompt specifies an era.
- Am I defaulting to the top 10 most obvious songs for this mood/genre? If yes, dig deeper.

For every playlist, aim for:
- At least 3 different decades represented (unless prompt restricts era)
- At least 4 different artists in the first 10 tracks
- A mix of well-known tracks AND deep cuts / underrated gems
- At least 1 non-English language track where it fits the vibe naturally
- At least 1 unexpected/surprising pick that still makes complete sense in context

═══════════════════════════════════════════════════════════════════════════════
PROMPT ANALYSIS — DO THIS BEFORE GENERATING:
═══════════════════════════════════════════════════════════════════════════════

Read the user's prompt and extract these 6 dimensions:

1. PRIMARY MOOD — What is the dominant emotional tone?
   (e.g. melancholic, euphoric, tense, peaceful, nostalgic, rebellious)

2. ENERGY LEVEL — Rate it 1–10
   1–3 = slow, quiet, introspective
   4–6 = medium, flowing, steady
   7–10 = high energy, intense, driving

3. ACTIVITY CONTEXT — What is the user likely doing?
   (driving, working out, studying, partying, grieving, celebrating, etc.)

4. SONIC PALETTE — What should the music sound like?
   (dense/sparse, loud/soft, warm/cold, organic/electronic, raw/polished)

5. ERA BIAS — Does the prompt suggest a time period?
   If not, default to spanning multiple decades.

6. EXPLICIT REQUESTS — Did the user name artists, songs, or genres?
   If yes, honor them. Build around them, don't ignore them.

Use these 6 dimensions to define a precise musical target before selecting a single track.

═══════════════════════════════════════════════════════════════════════════════
TRACK SELECTION LOGIC:
═══════════════════════════════════════════════════════════════════════════════

For each track you select, it must pass ALL of these checks:

✓ Matches the primary mood of the prompt
✓ Fits the energy level range
✓ Makes sense in the activity context
✓ Has not been recommended in this session
✓ Is a real, existing, releasable song (not fabricated)
✓ Contributes something the previous tracks don't already cover

Actively vary across:
- Genre (don't stay in one lane unless the prompt demands it)
- Artist gender, origin, and era
- Song structure (some with builds, some stripped back, some mid-tempo)
- Emotional texture (even within one mood, songs can hit differently)

═══════════════════════════════════════════════════════════════════════════════
DEPTH TIERS — USE ALL THREE (across all ${trackCount} tracks):
═══════════════════════════════════════════════════════════════════════════════

TIER 1 — FAMILIAR ANCHORS (${anchorCount} tracks, ~30%)
Well-known songs that immediately validate the vibe. 
The user hears these and thinks "yes, this is right."

TIER 2 — SOLID MID-RANGE (${midCount} tracks, ~40%)
Known to music fans but not overplayed. 
Songs that feel like smart picks, not obvious ones.

TIER 3 — DEEP CUTS & DISCOVERIES (${deepCutCount} tracks, ~30%)
Underrated, underplayed, or non-mainstream tracks that perfectly fit the prompt. 
This is where the playlist earns its quality.
These should feel like recommendations from a friend who really knows music — not what an algorithm would surface.

═══════════════════════════════════════════════════════════════════════════════
FINAL INSTRUCTION:
═══════════════════════════════════════════════════════════════════════════════

Your goal is not to generate A playlist. It is to generate THE playlist — 
the one that makes the user think "how did it know exactly what I needed?" 

Surprise them. Respect the prompt. Vary everything. Never repeat.

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — Return ONLY valid JSON, no markdown, no extra text:
═══════════════════════════════════════════════════════════════════════════════

{
  "playlist_title": "A creative, evocative title — not generic",
  "playlist_description": "2 sentences. What this playlist feels like and who it's for. Write it like a human, not an AI.",
  "mood_tags": ["tag1", "tag2", "tag3"],
  "energy_level": 6,
  "track_count": ${trackCount},
  "tracks": [
    {
      "track": "Song Name",
      "artist": "Artist Name",
      "year": 2019,
      "tier": "anchor",
      "mood_fit": "One sentence on why this track belongs here"
    }
  ]
}

Note: "tier" must be one of: "anchor", "mid-range", or "deep cut"`;
}

function buildRefinementPrompt(trackCount: number): string {
  return `You are an expert music curator refining an existing AI playlist based on the user's instruction.

═══════════════════════════════════════════════════════════════════════════════
CHANGE SCALE GUIDE — use this to decide how many tracks to swap:
═══════════════════════════════════════════════════════════════════════════════

- Broad vibe/mood/genre shift (e.g. "make it more upbeat", "more indie", "darker feel"): 
  → Replace 40–60% of tracks (${Math.round(trackCount * 0.4)}–${Math.round(trackCount * 0.6)} tracks)
  
- Adding or removing something specific (e.g. "add more female artists", "less rap"): 
  → Replace 30–50% of tracks (${Math.round(trackCount * 0.3)}–${Math.round(trackCount * 0.5)} tracks)
  
- Specific song swap or small fix (e.g. "remove that Drake song"): 
  → Replace only what's needed (1–3 tracks)
  
- Full rebuild request (e.g. "start over", "completely different"): 
  → Replace 80–100% of tracks (${Math.round(trackCount * 0.8)}+ tracks)
  
- Default when unclear: 
  → Replace at least 30–40% of tracks — never fewer than 3 songs

═══════════════════════════════════════════════════════════════════════════════
VARIANCE RULES STILL APPLY:
═══════════════════════════════════════════════════════════════════════════════

- Max 2 tracks per artist (unless prompt is artist-specific)
- Span at least 3 different decades (unless era-specific request)
- Mix of well-known AND deep cuts
- At least 1 non-English track where it fits naturally
- At least 1 unexpected/surprising pick that still makes sense

═══════════════════════════════════════════════════════════════════════════════
DEPTH TIER TARGETS:
═══════════════════════════════════════════════════════════════════════════════

Maintain this distribution across all ${trackCount} tracks:
- ~30% FAMILIAR ANCHORS (well-known, validates the vibe)
- ~40% SOLID MID-RANGE (smart picks, not overplayed)
- ~30% DEEP CUTS (underrated gems, rewards the listener)

═══════════════════════════════════════════════════════════════════════════════
RULES:
═══════════════════════════════════════════════════════════════════════════════

- Always return the FULL updated playlist in the same JSON format — every track, not just changes
- Return EXACTLY ${trackCount} tracks — no more, no fewer
- Keep tracks that genuinely fit the refined direction; replace those that don't
- Every track must be a real, well-known song available on Spotify
- Apply the refinement meaningfully throughout the playlist, not just at the edges
- Update playlist_title and playlist_description to reflect the refined direction
- Return ONLY valid JSON, no markdown, no extra text

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT:
═══════════════════════════════════════════════════════════════════════════════

{
  "playlist_title": "Evocative title",
  "playlist_description": "2 sentences about the feel.",
  "mood_tags": ["tag1", "tag2", "tag3"],
  "energy_level": 6,
  "track_count": ${trackCount},
  "tracks": [
    {
      "track": "Song Name",
      "artist": "Artist Name",
      "year": 2019,
      "tier": "anchor",
      "mood_fit": "Why this track belongs"
    }
  ]
}

Note: "tier" must be one of: "anchor", "mid-range", or "deep cut"`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function generatePlaylistRecommendations(
  prompt: string,
  excludedTrackNames: string[] = [],
  _excludedTrackIds: string[] = []
): Promise<RecommendationResult> {
  console.log('=== GENERATE START ===');
  console.log('Prompt:', prompt);

  const trackCount = parseRequestedTrackCount(prompt);
  console.log(`🎯 Target track count: ${trackCount}`);

  const exclusionNote = excludedTrackNames.length > 0
    ? `\n\nDo NOT include any of these songs (already shown to the user):\n${excludedTrackNames.map(t => `- ${t}`).join('\n')}\nChoose completely different tracks.`
    : '';

  // Scale tokens: ~160 tokens per track + 600 base overhead, max 6000
  const maxTokens = Math.min(600 + trackCount * 160, 6000);

  // Run OpenAI and Spotify token fetch in parallel — they don't depend on each other
  console.log('⚡ Fetching Spotify token + calling OpenAI in parallel...');
  const [token, aiPlaylist] = await Promise.all([
    getSpotifyToken(),
    callOpenAI(buildGenerationPrompt(trackCount), prompt + exclusionNote, maxTokens),
  ]);
  console.log(`✅ Token acquired, OpenAI returned ${aiPlaylist.tracks.length} tracks`);

  const tracks = await resolveTracks(aiPlaylist.tracks, token);

  if (tracks.length === 0) {
    throw new Error('No tracks could be generated. Please try again.');
  }

  const result: RecommendationResult = {
    playlist_title: aiPlaylist.playlist_title,
    playlist_description: aiPlaylist.playlist_description,
    tracks,
    mood_tags: aiPlaylist.mood_tags || [],
    audio_profile: deriveAudioProfile(aiPlaylist),
  };

  console.log(`=== GENERATE END — "${result.playlist_title}" — ${result.tracks.length} tracks ===`);
  return result;
}

export async function refinePlaylistRecommendations(
  refinementPrompt: string,
  currentPlaylist: { title: string; tracks: Array<{ track_name: string; artist: string; position: number }> }
): Promise<RecommendationResult> {
  console.log('=== REFINE START ===');
  console.log('Refinement prompt:', refinementPrompt);

  // Honour explicit count changes in refinement (e.g. "add 5 more songs"), otherwise keep current count
  const currentCount = currentPlaylist.tracks.length;
  const requestedCount = parseRequestedTrackCount(refinementPrompt);
  // If the refinement prompt doesn't contain a count keyword, keep the existing count
  const hasExplicitCount = /(\d+)\s*(?:song|track|tune)s?|(\d+(?:\.\d+)?)\s*(?:hour|hr)s?|(\d+)\s*min(?:ute)?s?/.test(refinementPrompt.toLowerCase());
  const trackCount = hasExplicitCount ? requestedCount : currentCount;
  console.log(`🎯 Target track count for refinement: ${trackCount}`);

  const trackList = currentPlaylist.tracks
    .map(t => `${t.position}. "${t.track_name}" by ${t.artist}`)
    .join('\n');

  const userMessage = `Current playlist: "${currentPlaylist.title}"\n\nTracks:\n${trackList}\n\nRefinement request: ${refinementPrompt}`;

  const originalKeys = new Set(
    currentPlaylist.tracks.map(t => `${t.track_name.toLowerCase()}::${t.artist.toLowerCase()}`)
  );

  const maxTokens = Math.min(600 + trackCount * 160, 6000);

  // Run OpenAI and Spotify token fetch in parallel
  console.log('⚡ Fetching Spotify token + calling OpenAI in parallel...');
  const [token, aiPlaylist] = await Promise.all([
    getSpotifyToken(),
    callOpenAI(buildRefinementPrompt(trackCount), userMessage, maxTokens),
  ]);
  console.log(`✅ Token acquired, OpenAI returned ${aiPlaylist.tracks.length} tracks`);

  const tracks = await resolveTracks(aiPlaylist.tracks, token, originalKeys);

  if (tracks.length === 0) {
    throw new Error('No tracks could be resolved during refinement. Please try again.');
  }

  const result: RecommendationResult = {
    playlist_title: aiPlaylist.playlist_title,
    playlist_description: aiPlaylist.playlist_description,
    tracks,
    mood_tags: aiPlaylist.mood_tags || [],
    audio_profile: deriveAudioProfile(aiPlaylist),
  };

  console.log(`=== REFINE END — "${result.playlist_title}" — ${result.tracks.length} tracks ===`);
  return result;
}