# Spotify Authentication Setup Guide

Your secure Spotify authentication system is now fully implemented! Follow these steps to complete the setup.

## 🎯 What's Been Built

### ✅ Backend Infrastructure (Supabase)
- **Authorization Code Flow with PKCE** - Most secure OAuth implementation
- **Token Management** - Automatic refresh of expired tokens
- **Session Management** - HTTP-only secure sessions
- **Error Handling** - Graceful error recovery and reconnection prompts

### ✅ Frontend Integration
- **OAuth Initialization** - Seamless redirect to Spotify authorization
- **Callback Handling** - Automatic processing of OAuth responses
- **Success Messages** - 3-second confirmation on successful connection
- **Error States** - User-friendly error messages

### ✅ Security Features
- **Server-side Token Storage** - Tokens never exposed to client
- **PKCE Implementation** - Protection against authorization code interception
- **State Validation** - CSRF attack prevention
- **Automatic Token Refresh** - Seamless user experience without re-login

---

## 📋 Setup Steps

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click **"Create App"**
4. Fill in the details:
   - **App Name**: Jams (or your preferred name)
   - **App Description**: AI-powered playlist generator
   - **Redirect URI**: `https://zqrhgewzqufalfmuzcyk.supabase.co/functions/v1/make-server-d124bc75/auth/spotify/callback`
5. Check the **Terms of Service** checkbox
6. Click **"Save"**

### 2. Get Your Credentials

1. In your Spotify app dashboard, click **"Settings"**
2. Copy the **Client ID**
3. Click **"View client secret"** and copy the **Client Secret**

### 3. Set Environment Variables

You need to set environment variables in your Supabase project. The redirect URI is now automatically constructed from your SUPABASE_URL.

#### Required Variables:
- `SPOTIFY_CLIENT_ID` - Your app's Client ID from Spotify Dashboard
- `SPOTIFY_CLIENT_SECRET` - Your app's Client Secret from Spotify Dashboard

#### How to Set Environment Variables in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** (gear icon in sidebar)
3. Click on **Edge Functions** in the left menu
4. Scroll to **Environment Variables** section
5. Add each variable:
   - Click **"Add new variable"**
   - Enter `SPOTIFY_CLIENT_ID` as the name
   - Paste your Client ID as the value
   - Click **"Save"**
   - Repeat for `SPOTIFY_CLIENT_SECRET`

**Important**: After adding environment variables, you may need to redeploy your Edge Functions or wait a few moments for them to take effect.

**Note**: The system automatically constructs the redirect URI as:
`https://zqrhgewzqufalfmuzcyk.supabase.co/functions/v1/make-server-d124bc75/auth/spotify/callback`

Make sure this exact URI is added to your Spotify app's Redirect URIs in step 1.

---

## 🔄 How It Works

### Authentication Flow

```
1. User clicks "Generate Playlist" or "Connect Spotify"
   ↓
2. Frontend calls /auth/spotify/init endpoint
   ↓
3. Backend generates PKCE code_verifier and code_challenge
   ↓
4. User redirected to Spotify authorization page
   ↓
5. User approves permissions
   ↓
6. Spotify redirects back to /auth/spotify/callback
   ↓
7. Backend exchanges code for access_token + refresh_token
   ↓
8. Backend fetches user profile and stores tokens securely
   ↓
9. User redirected back to app with session
   ↓
10. Success message displayed for 3 seconds
```

### Token Refresh Flow

```
1. User makes API request requiring Spotify access
   ↓
2. Backend checks if access_token is expired
   ↓
3. If expired: Use refresh_token to get new access_token
   ↓
4. Update stored tokens
   ↓
5. Continue with request using new access_token
```

---

## 🔐 Requested Scopes

The app requests these minimal permissions:

| Scope | Purpose |
|-------|---------|
| `user-library-read` | Access saved tracks and albums |
| `user-top-read` | Get top artists and tracks for better recommendations |
| `user-read-recently-played` | Understand listening patterns |
| `playlist-modify-public` | Create and modify public playlists |
| `playlist-modify-private` | Create and modify private playlists |

---

## 🗄️ Data Storage

All data is stored in the Supabase KV store:

### Token Storage
```typescript
Key: spotify:user:{spotifyUserId}
Value: {
  spotifyUserId: string,
  accessToken: string,
  refreshToken: string,
  expirationTime: number,
  updatedAt: number
}
```

### Session Storage
```typescript
Key: session:{sessionId}
Value: {
  spotifyUserId: string,
  createdAt: number
}
```

### PKCE Storage (temporary, 10min expiry)
```typescript
Key: pkce:{sessionId}
Value: {
  codeVerifier: string,
  state: string,
  timestamp: number
}
```

---

## 🧪 Testing the Integration

### 1. Test Authentication Flow
1. Click "Generate Playlist" button (with text in input)
2. Or click "Connect Spotify" in header
3. Verify redirect to Spotify authorization page
4. Approve permissions
5. Verify redirect back to app
6. Check for green success message
7. Open browser DevTools → Console → Check for errors

### 2. Test Returning User
1. Refresh the page
2. App should remember you're authenticated
3. No need to re-login

### 3. Test Token Refresh
1. Wait for token to expire (default: 1 hour)
2. Or manually set shorter expiration for testing
3. Make API request
4. Token should refresh automatically in background

---

## 🛠️ API Endpoints

### POST `/make-server-d124bc75/auth/spotify/init`
Initialize OAuth flow
- **Returns**: `{ authUrl, sessionId }`
- **Use**: Redirect user to `authUrl`

### GET `/make-server-d124bc75/auth/spotify/callback`
Handle OAuth callback
- **Params**: `code`, `state`, `session_id`
- **Returns**: Redirects to app with session

### GET `/make-server-d124bc75/auth/status`
Check authentication status
- **Params**: `session_id` (query param)
- **Returns**: `{ authenticated: boolean, spotifyUserId?: string }`

### GET `/make-server-d124bc75/user/profile`
Get Spotify user profile
- **Params**: `session_id` (query param)
- **Returns**: Spotify user profile object
- **Note**: Automatically refreshes token if expired

---

## 🐛 Error Handling

### User Denies Permission
- URL param: `?error=user_denied`
- User sees: Silent failure, can try again

### Invalid Session
- URL param: `?error=invalid_session`
- User sees: "Please try connecting again"

### Token Refresh Failure
- Response: `{ error: "reconnect_required" }`
- Frontend: Clears session, prompts reconnection

### Missing Credentials
- Response: `{ error: "Spotify authentication is not configured..." }`
- Action: Check environment variables are set

---

## 📱 Frontend Usage

### Check if user is authenticated
```typescript
import { checkAuthStatus } from './utils/spotifyAuth';

const { authenticated, spotifyUserId } = await checkAuthStatus();
```

### Get user profile
```typescript
import { getUserProfile } from './utils/spotifyAuth';

const profile = await getUserProfile();
console.log(profile.display_name, profile.email);
```

### Initiate authentication
```typescript
import { initiateSpotifyAuth } from './utils/spotifyAuth';

await initiateSpotifyAuth(); // Redirects to Spotify
```

---

## ✨ Next Steps

1. ✅ Set `SPOTIFY_REDIRECT_URI` environment variable
2. ✅ Test the full authentication flow
3. Build playlist generation logic using authenticated API calls
4. Add user profile display in header
5. Implement playlist creation functionality
6. Add disconnect/logout functionality

---

## 🔒 Security Notes

- ✅ Tokens stored server-side only
- ✅ PKCE prevents code interception
- ✅ State parameter prevents CSRF
- ✅ Automatic token refresh
- ✅ Session-based authentication
- ⚠️ **Important**: This is an MVP implementation. For production, consider:
  - Token encryption at rest
  - Rate limiting on auth endpoints
  - Session expiration/rotation
  - Audit logging

---

## 📞 Support

If you encounter any issues:

1. Check browser console for errors
2. Check Supabase logs for backend errors
3. Verify all environment variables are set correctly
4. Ensure redirect URI matches exactly in Spotify dashboard

---

**Status**: ✅ Ready for testing once environment variables are configured!