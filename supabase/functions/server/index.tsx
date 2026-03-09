import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { getCookie, setCookie } from "npm:hono/cookie";
import * as kv from "./kv_store.tsx";
import * as spotifyAuth from "./spotify_auth.tsx";
import * as recommendation from "./recommendation.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods - must come before other middleware
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "x-client-info", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

// Handle OPTIONS preflight requests explicitly
app.options("/*", (c) => {
  return c.text("", 204);
});

// Health check endpoint
app.get("/make-server-d124bc75/health", (c) => {
  return c.json({ status: "ok" });
});

// Debug endpoint to verify Spotify credentials configuration (without exposing actual values)
app.get("/make-server-d124bc75/debug/spotify-config", (c) => {
  const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID');
  const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  
  const REDIRECT_URI = SUPABASE_URL 
    ? `${SUPABASE_URL}/functions/v1/make-server-d124bc75/auth/spotify/callback`
    : Deno.env.get('SPOTIFY_REDIRECT_URI');

  const maskString = (str: string | undefined) => {
    if (!str) return null;
    if (str.length <= 8) return '***';
    return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`;
  };

  const hasWhitespace = (str: string | undefined) => {
    if (!str) return null;
    return {
      leading: str !== str.trimStart(),
      trailing: str !== str.trimEnd(),
      internal: str.includes(' '),
    };
  };

  return c.json({
    spotify_client_id: {
      configured: !!SPOTIFY_CLIENT_ID,
      length: SPOTIFY_CLIENT_ID?.length || 0,
      preview: maskString(SPOTIFY_CLIENT_ID),
      whitespace: hasWhitespace(SPOTIFY_CLIENT_ID),
      expectedLength: 32,
      lengthMatch: SPOTIFY_CLIENT_ID?.trim().length === 32,
    },
    spotify_client_secret: {
      configured: !!SPOTIFY_CLIENT_SECRET,
      length: SPOTIFY_CLIENT_SECRET?.length || 0,
      preview: maskString(SPOTIFY_CLIENT_SECRET),
      whitespace: hasWhitespace(SPOTIFY_CLIENT_SECRET),
      expectedLength: 32,
      lengthMatch: SPOTIFY_CLIENT_SECRET?.trim().length === 32,
    },
    redirect_uri: {
      value: REDIRECT_URI,
      configured: !!REDIRECT_URI,
    },
    supabase_url: {
      configured: !!SUPABASE_URL,
      value: SUPABASE_URL,
    },
    instructions: {
      message: "Spotify credentials should both be exactly 32 characters long with no spaces.",
      next_steps: [
        "1. Verify credentials in Spotify Developer Dashboard (https://developer.spotify.com/dashboard)",
        "2. Ensure redirect URI is added to your Spotify app settings",
        "3. Update Supabase secrets if credentials don't match expected format",
      ],
    },
  });
});

// Debug endpoint to verify Gemini configuration and test connection
app.get("/make-server-d124bc75/debug/gemini-config", async (c) => {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

  const maskString = (str: string | undefined) => {
    if (!str) return null;
    if (str.length <= 8) return '***';
    return `${str.substring(0, 6)}...${str.substring(str.length - 4)}`;
  };

  const result: any = {
    gemini_api_key: {
      configured: !!GEMINI_API_KEY,
      length: GEMINI_API_KEY?.length || 0,
      preview: maskString(GEMINI_API_KEY),
      has_whitespace: GEMINI_API_KEY
        ? GEMINI_API_KEY !== GEMINI_API_KEY.trim() || GEMINI_API_KEY.includes(' ')
        : null,
    },
  };

  if (GEMINI_API_KEY) {
    try {
      console.log('Testing Gemini API connection...');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply with the word: connected' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        result.connection_test = {
          status: 'success',
          model: 'gemini-2.0-flash',
          message: 'Gemini API connection successful',
          response: data.candidates?.[0]?.content?.parts?.[0]?.text,
        };
      } else {
        const errorText = await response.text();
        result.connection_test = {
          status: 'failed',
          http_status: response.status,
          error: errorText,
          message: 'Gemini API returned an error',
        };
      }
    } catch (error) {
      result.connection_test = {
        status: 'error',
        error: error.message,
        message: 'Failed to connect to Gemini API',
      };
    }
  } else {
    result.connection_test = {
      status: 'not_configured',
      message: 'Gemini API key not found in environment variables',
    };
  }

  return c.json(result);
});

// ── New: Step-by-step generation pipeline diagnostic ─────────────────────────
app.get("/make-server-d124bc75/debug/test-generation", async (c) => {
  const results: Record<string, any> = {};

  // Step 1: Check env vars
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')?.trim();
  const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  results.env = {
    spotify_client_id: { configured: !!clientId, length: clientId?.length ?? 0 },
    spotify_client_secret: { configured: !!clientSecret, length: clientSecret?.length ?? 0 },
    openai_api_key: { configured: !!openaiKey, length: openaiKey?.length ?? 0 },
  };

  // Step 2: Test Spotify client-credentials token
  let spotifyToken: string | null = null;
  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: 'grant_type=client_credentials',
    });
    const tokenBody = await tokenRes.text();
    if (tokenRes.ok) {
      const tokenData = JSON.parse(tokenBody);
      spotifyToken = tokenData.access_token;
      results.spotify_token = { success: true, token_type: tokenData.token_type, expires_in: tokenData.expires_in };
    } else {
      results.spotify_token = { success: false, http_status: tokenRes.status, body: tokenBody };
    }
  } catch (e: any) {
    results.spotify_token = { success: false, error: e.message };
  }

  // Step 3: Test a Spotify search (only if we got a token)
  if (spotifyToken) {
    try {
      const searchRes = await fetch(
        `https://api.spotify.com/v1/search?${new URLSearchParams({ q: 'Bohemian Rhapsody Queen', type: 'track', limit: '1', market: 'US' })}`,
        { headers: { 'Authorization': `Bearer ${spotifyToken}` } }
      );
      const searchBody = await searchRes.text();
      if (searchRes.ok) {
        const searchData = JSON.parse(searchBody);
        const firstTrack = searchData.tracks?.items?.[0];
        results.spotify_search = {
          success: true,
          found_track: firstTrack ? `${firstTrack.name} by ${firstTrack.artists?.[0]?.name}` : 'no results',
          total_results: searchData.tracks?.total ?? 0,
        };
      } else {
        results.spotify_search = { success: false, http_status: searchRes.status, body: searchBody };
      }
    } catch (e: any) {
      results.spotify_search = { success: false, error: e.message };
    }
  } else {
    results.spotify_search = { skipped: 'No Spotify token available' };
  }

  // Step 4: Test OpenAI with a minimal playlist (3 tracks)
  if (openaiKey) {
    try {
      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: 'Return valid JSON with exactly 3 track objects. Each must have: track (string), artist (string). Example: {"tracks":[{"track":"Name","artist":"Artist"}]}',
          }],
        }),
      });
      const aiBody = await aiRes.text();
      if (aiRes.ok) {
        const aiData = JSON.parse(aiBody);
        const content = aiData.choices?.[0]?.message?.content;
        const parsed = JSON.parse(content);
        results.openai = { success: true, tracks_returned: parsed.tracks?.length ?? 0, sample: parsed.tracks?.[0] };
      } else {
        results.openai = { success: false, http_status: aiRes.status, body: aiBody };
      }
    } catch (e: any) {
      results.openai = { success: false, error: e.message };
    }
  } else {
    results.openai = { skipped: 'No OpenAI key configured' };
  }

  // Overall verdict
  results.verdict = {
    all_systems_go:
      results.spotify_token?.success === true &&
      results.spotify_search?.success === true &&
      results.openai?.success === true,
    failing_step:
      results.spotify_token?.success !== true ? 'spotify_token' :
      results.spotify_search?.success !== true ? 'spotify_search' :
      results.openai?.success !== true ? 'openai' :
      null,
  };

  return c.json(results);
});

// Spotify Auth Routes

// Initialize Spotify OAuth flow
app.post("/make-server-d124bc75/auth/spotify/init", async (c) => {
  try {
    console.log('=== INIT ENDPOINT CALLED ===');
    console.log('Request headers:', Object.fromEntries(c.req.raw.headers.entries()));
    
    let redirectUri;
    let rawBody;
    
    // Try to parse JSON body, fall back to empty object if body is empty
    try {
      const bodyText = await c.req.text();
      console.log('Raw request body:', bodyText);
      rawBody = bodyText;
      
      if (bodyText) {
        const body = JSON.parse(bodyText);
        console.log('Parsed body:', body);
        redirectUri = body.redirectUri;
      }
    } catch (e) {
      console.error('Error parsing request body:', e);
      console.log('Raw body was:', rawBody);
    }
    
    const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID');

    console.log('Initializing Spotify auth with:', {
      hasClientId: !!SPOTIFY_CLIENT_ID,
      clientIdLength: SPOTIFY_CLIENT_ID?.length,
      redirectUri,
      hasRedirectUri: !!redirectUri,
    });

    if (!SPOTIFY_CLIENT_ID) {
      console.error('SPOTIFY_CLIENT_ID is not set');
      return c.json({ 
        error: 'Spotify Client ID is not configured. Please set the SPOTIFY_CLIENT_ID environment variable in your Supabase project settings.' 
      }, 500);
    }

    if (!redirectUri) {
      console.error('redirectUri not provided or empty');
      console.error('Raw body was:', rawBody);
      return c.json({ 
        error: 'Redirect URI is required. Please ensure the request body contains a redirectUri field.' 
      }, 400);
    }

    // Generate PKCE parameters
    const state = spotifyAuth.generateRandomString(16);
    const codeVerifier = spotifyAuth.generateRandomString(128);
    const codeChallenge = await spotifyAuth.generateCodeChallenge(codeVerifier);
    
    // Create session ID
    const sessionId = spotifyAuth.generateRandomString(32);
    
    // Store PKCE session with redirect URI
    await kv.set(`pkce:${sessionId}`, JSON.stringify({
      codeVerifier,
      state,
      redirectUri,
      timestamp: Date.now(),
    }));
    
    // Build authorization URL
    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID.trim(),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: spotifyAuth.SPOTIFY_SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });
    
    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    
    console.log('Successfully initialized Spotify auth, redirecting to:', authUrl);
    
    return c.json({ 
      authUrl,
      sessionId,
    });
  } catch (error) {
    console.error('Error initializing Spotify auth:', error);
    console.error('Error stack:', error.stack);
    return c.json({ error: 'Failed to initialize Spotify authentication: ' + error.message }, 500);
  }
});

// Handle Spotify OAuth callback
app.get("/make-server-d124bc75/auth/spotify/callback", async (c) => {
  // Since Supabase may be enforcing JWT verification, we'll return an HTML page
  // that extracts the parameters and makes an authenticated request from the client
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  
  // Return HTML page that will handle the auth flow client-side
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connecting to Spotify...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: #0a0b0d;
      color: white;
    }
    .container {
      text-align: center;
    }
    .spinner {
      border: 3px solid #333;
      border-top: 3px solid #4feec5;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Connecting to Spotify...</p>
  </div>
  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const sessionId = sessionStorage.getItem('spotify_auth_session');
    
    if (error) {
      window.location.href = '/?error=' + error;
    } else if (code && state && sessionId) {
      // Make authenticated request to complete the OAuth flow
      fetch('/functions/v1/make-server-d124bc75/auth/spotify/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${SUPABASE_ANON_KEY}',
          'apikey': '${SUPABASE_ANON_KEY}'
        },
        body: JSON.stringify({ code, state, sessionId })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          window.location.href = '/?error=' + encodeURIComponent(data.error);
        } else {
          // Check if this was a playlist generation flow
          const isPlaylistGen = sessionStorage.getItem('spotify_playlist_generation') === 'true';
          const playlistPrompt = sessionStorage.getItem('spotify_playlist_prompt') || '';
          
          // Build redirect URL
          let redirectUrl = '/?session=' + data.sessionId + '&spotify_connected=true';
          if (isPlaylistGen) {
            redirectUrl += '&playlist_generation=true';
            if (playlistPrompt) {
              redirectUrl += '&prompt=' + encodeURIComponent(playlistPrompt);
            }
          }
          
          window.location.href = redirectUrl;
        }
      })
      .catch(err => {
        window.location.href = '/?error=auth_failed&message=' + encodeURIComponent(err.message);
      });
    } else {
      window.location.href = '/?error=missing_parameters';
    }
  </script>
</body>
</html>`.replace(/\$\{SUPABASE_ANON_KEY\}/g, Deno.env.get('SUPABASE_ANON_KEY') || '');
  
  return c.html(html);
});

// Complete Spotify OAuth flow from client-side request
app.post("/make-server-d124bc75/auth/spotify/complete", async (c) => {
  try {
    const { code, state, sessionId } = await c.req.json();
    
    console.log('=== COMPLETING SPOTIFY AUTH ===');
    console.log('Params:', { hasCode: !!code, hasState: !!state, hasSessionId: !!sessionId });

    if (!code || !state || !sessionId) {
      console.error('Missing parameters:', { code: !!code, state: !!state, sessionId: !!sessionId });
      return c.json({ error: 'missing_parameters' }, 400);
    }

    // Retrieve PKCE session
    console.log('Retrieving PKCE session for:', sessionId);
    const pkceSession = await kv.get(`pkce:${sessionId}`);
    
    if (!pkceSession) {
      console.error('PKCE session not found');
      return c.json({ error: 'invalid_session' }, 400);
    }

    const parsedSession = JSON.parse(pkceSession);
    
    // Validate state
    if (parsedSession.state !== state) {
      console.error('State mismatch');
      return c.json({ error: 'state_mismatch' }, 400);
    }

    console.log('Exchanging code for tokens...');
    // Exchange code for tokens (using the redirect URI from the session)
    const tokenResponse = await spotifyAuth.exchangeCodeForTokens(code, parsedSession.codeVerifier, parsedSession.redirectUri);
    
    console.log('Getting user profile...');
    // Get user profile
    const profile = await spotifyAuth.getSpotifyProfile(tokenResponse.access_token);
    
    console.log('Storing tokens for user:', profile.id);
    // Store tokens
    await spotifyAuth.storeUserTokens(
      profile.id,
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.expires_in
    );
    
    console.log('Creating user session...');
    // Create user session
    const userSessionId = await spotifyAuth.createUserSession(profile.id);
    
    // Clean up PKCE session
    await kv.del(`pkce:${sessionId}`);
    
    console.log('Auth complete, returning session:', userSessionId);
    return c.json({ sessionId: userSessionId });
  } catch (error) {
    console.error('=== ERROR IN SPOTIFY CALLBACK ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    return c.json({ error: 'auth_failed', message: error.message }, 500);
  }
});

// Check authentication status
app.get("/make-server-d124bc75/auth/status", async (c) => {
  try {
    const sessionId = c.req.query('session_id');
    
    if (!sessionId) {
      return c.json({ authenticated: false });
    }
    
    const session = await spotifyAuth.getUserFromSession(sessionId);
    
    if (!session) {
      return c.json({ authenticated: false });
    }
    
    const tokens = await spotifyAuth.getUserTokens(session.spotifyUserId);
    
    if (!tokens) {
      return c.json({ authenticated: false });
    }
    
    return c.json({ 
      authenticated: true,
      spotifyUserId: session.spotifyUserId,
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    return c.json({ authenticated: false, error: error.message }, 500);
  }
});

// Get current user profile
app.get("/make-server-d124bc75/user/profile", async (c) => {
  try {
    const sessionId = c.req.query('session_id');
    
    if (!sessionId) {
      return c.json({ error: 'Session ID required' }, 401);
    }
    
    const session = await spotifyAuth.getUserFromSession(sessionId);
    
    if (!session) {
      return c.json({ error: 'Invalid session' }, 401);
    }
    
    // Get valid access token (will refresh if needed)
    const accessToken = await spotifyAuth.getValidAccessToken(session.spotifyUserId);
    
    // Get user profile from Spotify
    const profile = await spotifyAuth.getSpotifyProfile(accessToken);
    
    return c.json(profile);
  } catch (error) {
    console.error('Error getting user profile:', error);
    
    if (error.message.includes('Token refresh failed')) {
      return c.json({ error: 'reconnect_required', message: error.message }, 401);
    }
    
    return c.json({ error: error.message }, 500);
  }
});

// Recommendation Routes

// Save playlist to Spotify
app.post("/make-server-d124bc75/spotify/save-playlist", async (c) => {
  try {
    const { sessionId, title, description, trackIds } = await c.req.json();

    if (!sessionId) {
      return c.json({ error: 'Session ID required' }, 401);
    }
    if (!trackIds || !trackIds.length) {
      return c.json({ error: 'Track IDs required' }, 400);
    }

    // Get session → spotify user
    const session = await spotifyAuth.getUserFromSession(sessionId);
    if (!session) {
      return c.json({ error: 'invalid_session', message: 'Session not found or expired. Please reconnect to Spotify.' }, 401);
    }

    // Get valid access token (auto-refreshes if expired)
    let accessToken: string;
    try {
      accessToken = await spotifyAuth.getValidAccessToken(session.spotifyUserId);
    } catch (e) {
      return c.json({ error: 'reconnect_required', message: 'Access token expired. Please reconnect to Spotify.' }, 401);
    }

    // Create playlist using /me/playlists (avoids 403 from user-scoped endpoint)
    const createRes = await fetch(`https://api.spotify.com/v1/me/playlists`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: title || 'Jams Playlist',
        description: description || 'Generated by Jams',
        public: false,
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Failed to create Spotify playlist:', err);
      return c.json({ error: 'Failed to create playlist', message: err }, 500);
    }
    const playlist = await createRes.json();
    const playlistId = playlist.id;
    const playlistUrl = playlist.external_urls?.spotify;

    // Add tracks in batches of 100
    const uris = trackIds.map((id: string) => `spotify:track:${id}`);
    for (let i = 0; i < uris.length; i += 100) {
      const batch = uris.slice(i, i + 100);
      const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: batch }),
      });
      if (!addRes.ok) {
        const err = await addRes.text();
        console.error('Failed to add tracks to playlist:', err);
        return c.json({ error: 'Failed to add tracks', message: err }, 500);
      }
    }

    console.log(`Playlist saved: ${playlistId} for user ${session.spotifyUserId}`);
    return c.json({ success: true, playlistId, playlistUrl });
  } catch (error) {
    console.error('Error saving playlist to Spotify:', error);
    return c.json({ error: 'Failed to save playlist', message: error.message }, 500);
  }
});

// Generate playlist recommendations
app.post("/make-server-d124bc75/generate-playlist", async (c) => {
  try {
    const { prompt, excludedTrackIds = [], excludedTrackNames = [] } = await c.req.json();
    
    if (!prompt) {
      return c.json({ error: 'Prompt is required' }, 400);
    }
    
    console.log('Generating playlist for prompt:', prompt);
    if (excludedTrackIds.length > 0) {
      console.log(`Excluding ${excludedTrackIds.length} previously generated track IDs`);
    }
    if (excludedTrackNames.length > 0) {
      console.log(`Providing AI with ${excludedTrackNames.length} track names to avoid:`, excludedTrackNames.slice(0, 5));
    }
    
    // Pass human-readable track names to the AI (IDs are opaque to OpenAI)
    const playlist = await recommendation.generatePlaylistRecommendations(prompt, excludedTrackNames, excludedTrackIds);
    
    return c.json(playlist);
  } catch (error) {
    console.error('=== ERROR GENERATING PLAYLIST ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    return c.json({ error: 'Failed to generate playlist', message: error.message }, 500);
  }
});

// Refine an existing playlist with AI
app.post("/make-server-d124bc75/refine-playlist", async (c) => {
  try {
    const { refinement_prompt, current_playlist } = await c.req.json();

    if (!refinement_prompt) {
      return c.json({ error: 'Refinement prompt is required' }, 400);
    }
    if (!current_playlist?.tracks?.length) {
      return c.json({ error: 'Current playlist tracks are required' }, 400);
    }

    console.log('Refining playlist with prompt:', refinement_prompt);
    const refined = await recommendation.refinePlaylistRecommendations(refinement_prompt, current_playlist);
    return c.json(refined);
  } catch (error) {
    console.error('=== ERROR REFINING PLAYLIST ===');
    console.error('Error:', error);
    return c.json({ error: 'Failed to refine playlist', message: error.message }, 500);
  }
});

// ── Playlist Sharing ─────────────────────────────────────────────────────────

// Store a shared playlist in KV
app.post("/make-server-d124bc75/playlists/share", async (c) => {
  try {
    const body = await c.req.json();
    const { id, title, description, mood_tags, tracks, prompt } = body;
    if (!id || !title || !tracks) {
      return c.json({ error: "Missing required fields: id, title, tracks" }, 400);
    }
    const payload = {
      id, title, description, mood_tags, tracks, prompt,
      created_at: new Date().toISOString(),
    };
    await kv.set(`shared:${id}`, payload);
    console.log(`Shared playlist stored: ${id}`);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error storing shared playlist:", error);
    return c.json({ error: "Failed to store shared playlist", message: error.message }, 500);
  }
});

// Retrieve a shared playlist by ID
app.get("/make-server-d124bc75/playlists/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const raw = await kv.get(`shared:${id}`);
    if (!raw) return c.json({ error: "not_found" }, 404);
    return c.json(raw);
  } catch (error) {
    console.error("Error retrieving shared playlist:", error);
    return c.json({ error: "Failed to retrieve shared playlist", message: error.message }, 500);
  }
});

Deno.serve(app.fetch);