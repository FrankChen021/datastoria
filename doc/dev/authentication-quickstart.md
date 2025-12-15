# Authentication Quick Start

## TL;DR

Authentication is **optional**. Without configuration, the app runs normally without login.

## Enable Authentication (3 steps)

### 1. Generate Secret

```bash
openssl rand -base64 32
```

### 2. Create `.env` file

```env
NEXTAUTH_SECRET=<paste-your-secret-here>

# Choose at least ONE provider:

# Option A: Google
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_GOOGLE_ENABLED=true

# Option B: GitHub
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
NEXT_PUBLIC_GITHUB_ENABLED=true

# Option C: Microsoft
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=your-microsoft-tenant-id
NEXT_PUBLIC_MICROSOFT_ENABLED=true
```

### 3. Configure OAuth Callback URLs

In your OAuth provider settings, add:

- **Google**: `http://localhost:3000/api/auth/callback/google`
- **GitHub**: `http://localhost:3000/api/auth/callback/github`
- **Microsoft**: `http://localhost:3000/api/auth/callback/microsoft-entra-id`

## Get OAuth Credentials

| Provider | Get Credentials |
|----------|----------------|
| **Google** | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) |
| **GitHub** | [github.com/settings/developers](https://github.com/settings/developers) |
| **Microsoft** | [portal.azure.com](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps) |

## Testing

```bash
# Start dev server
npm run dev

# Without auth config: Direct access
# With auth config: Redirects to login page
```

## Common Issues

### "Authentication is not enabled"
- Add OAuth credentials to `.env`
- Restart dev server

### "Redirect URI mismatch"
- Check OAuth callback URL matches exactly
- Include the correct protocol (http vs https)

### Login page shows no buttons
- Set `NEXT_PUBLIC_*_ENABLED=true` for your provider(s)
- Verify client ID and secret are set

## Full Documentation

See [AUTHENTICATION.md](./AUTHENTICATION.md) for detailed setup instructions.

## Architecture

```
User → Middleware (check auth) → Login Page → OAuth Provider
                    ↓                              ↓
               Main App ← Session (JWT) ← Callback Handler
```

## File Structure

```
src/
├── auth.ts                          # NextAuth config
├── middleware.ts                    # Route protection
├── app/
│   ├── login/page.tsx              # Login UI
│   └── api/auth/[...nextauth]/route.ts  # Auth handlers
└── components/
    └── user-nav.tsx                # User menu
```

## Environment Variables at a Glance

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXTAUTH_SECRET` | ✅ (if auth) | JWT encryption |
| `*_CLIENT_ID` | ✅ (per provider) | OAuth app ID |
| `*_CLIENT_SECRET` | ✅ (per provider) | OAuth app secret |
| `MICROSOFT_TENANT_ID` | ✅ (MS only) | Azure tenant |
| `NEXT_PUBLIC_*_ENABLED` | ❌ | Show login button |

## Production Checklist

- [ ] Use HTTPS
- [ ] Update OAuth redirect URIs to production domain
- [ ] Set strong `NEXTAUTH_SECRET`
- [ ] Never commit `.env` file
- [ ] Rotate secrets periodically
- [ ] Enable CORS if using external OAuth

## Quick Disable

Remove all OAuth variables from `.env` or delete the file. App will run without authentication.

