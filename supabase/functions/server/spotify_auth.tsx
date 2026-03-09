import * as kv from "./kv_store.tsx";

// Spotify API credentials - these should be set as environment variables
const SPOTIFY_CLIENT_ID = Deno.env.get('SPOTIFY_CLIENT_ID');
const SPOTIFY_CLIENT_SECRET = Deno.env.get('SPOTIFY_CLIENT_SECRET');

// Construct redirect URI from Supabase project URL
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
// Note: REDIRECT_URI is now determined at runtime in the init endpoint

// Scopes required for the app
export const SPOTIFY_SCOPES = [
  'user-library-read',
  'user-top-read',
  'user-read-recently-played',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

// Generate random string for state and code verifier
export function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((x) => possible[x % possible.length])
    .join('');
}

// Generate code challenge from verifier for PKCE
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Store PKCE verifier and state
export async function storePKCESession(sessionId: string, codeVerifier: string, state: string) {
  await kv.set(`pkce:${sessionId}`, JSON.stringify({
    codeVerifier,
    state,
    timestamp: Date.now(),
  }));
}

// Retrieve and validate PKCE session
export async function getPKCESession(sessionId: string) {
  const data = await kv.get(`pkce:${sessionId}`);
  if (!data) return null;
  
  const session = JSON.parse(data);
  
  // Session expires after 10 minutes
  if (Date.now() - session.timestamp > 10 * 60 * 1000) {
    await kv.del(`pkce:${sessionId}`);
    return null;
  }
  
  return session;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string, codeVerifier: string, redirectUri: string) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials not configured. Please set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables.');
  }

  // Trim any whitespace from credentials (common issue)
  const clientId = SPOTIFY_CLIENT_ID.trim();
  const clientSecret = SPOTIFY_CLIENT_SECRET.trim();

  console.log('Exchanging code for tokens with:', {
    hasCode: !!code,
    hasCodeVerifier: !!codeVerifier,
    redirectUri: redirectUri,
    clientIdLength: clientId.length,
    clientSecretLength: clientSecret.length,
  });

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const authHeader = 'Basic ' + btoa(`${clientId}:${clientSecret}`);

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': authHeader,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token exchange failed:', {
      status: response.status,
      statusText: response.statusText,
      error,
    });
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  return await response.json();
}

// Get Spotify user profile
export async function getSpotifyProfile(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Spotify profile: ${error}`);
  }

  return await response.json();
}

// Store user tokens
export async function storeUserTokens(spotifyUserId: string, accessToken: string, refreshToken: string, expiresIn: number) {
  const expirationTime = Date.now() + (expiresIn * 1000);
  
  await kv.set(`spotify:user:${spotifyUserId}`, JSON.stringify({
    spotifyUserId,
    accessToken,
    refreshToken,
    expirationTime,
    updatedAt: Date.now(),
  }));
}

// Get user tokens
export async function getUserTokens(spotifyUserId: string) {
  const data = await kv.get(`spotify:user:${spotifyUserId}`);
  if (!data) return null;
  
  return JSON.parse(data);
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials not configured.');
  }

  // Trim any whitespace from credentials
  const clientId = SPOTIFY_CLIENT_ID.trim();
  const clientSecret = SPOTIFY_CLIENT_SECRET.trim();

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token refresh failed:', {
      status: response.status,
      statusText: response.statusText,
      error,
    });
    throw new Error(`Failed to refresh access token: ${error}`);
  }

  return await response.json();
}

// Get valid access token (refresh if needed)
export async function getValidAccessToken(spotifyUserId: string) {
  const tokens = await getUserTokens(spotifyUserId);
  
  if (!tokens) {
    throw new Error('User not authenticated');
  }
  
  // Check if token is expired (with 5 minute buffer)
  if (Date.now() >= tokens.expirationTime - (5 * 60 * 1000)) {
    console.log('Access token expired, refreshing...');
    
    try {
      const refreshResponse = await refreshAccessToken(tokens.refreshToken);
      
      // Update stored tokens
      await storeUserTokens(
        spotifyUserId,
        refreshResponse.access_token,
        refreshResponse.refresh_token || tokens.refreshToken, // Use new refresh token if provided, otherwise keep existing
        refreshResponse.expires_in
      );
      
      return refreshResponse.access_token;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error('Token refresh failed. Please reconnect to Spotify.');
    }
  }
  
  return tokens.accessToken;
}

// Create session for authenticated user
export async function createUserSession(spotifyUserId: string): Promise<string> {
  const sessionId = generateRandomString(32);
  
  await kv.set(`session:${sessionId}`, JSON.stringify({
    spotifyUserId,
    createdAt: Date.now(),
  }));
  
  return sessionId;
}

// Get user from session
export async function getUserFromSession(sessionId: string) {
  const data = await kv.get(`session:${sessionId}`);
  if (!data) return null;
  
  return JSON.parse(data);
}