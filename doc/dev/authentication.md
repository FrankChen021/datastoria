# Authentication Setup Guide

ClickHouse Console supports optional authentication using NextAuth.js with OAuth providers. This guide will help you set up Google, GitHub, and/or Microsoft authentication.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Setting Up OAuth Providers](#setting-up-oauth-providers)
  - [Google OAuth](#google-oauth)
  - [GitHub OAuth](#github-oauth)
  - [Microsoft Entra ID OAuth](#microsoft-entra-id-oauth)
- [Running the Application](#running-the-application)
- [Troubleshooting](#troubleshooting)

## Overview

Authentication is **optional** in ClickHouse Console. If no OAuth providers are configured, the application will run without authentication and users can access it directly.

When authentication is enabled:
- Users must sign in before accessing the console
- Multiple OAuth providers can be enabled simultaneously
- User sessions are maintained with JWT tokens
- Sessions last for 7 days by default

## Prerequisites

- Node.js 18+ installed
- A domain or localhost for development
- OAuth application credentials from your chosen provider(s)

## Configuration

1. Create a `.env` file in the root directory (copy from `.env.example`):

```bash
cp .env.example .env
```

2. Generate a secret for NextAuth:

```bash
openssl rand -base64 32
```

3. Add the generated secret to your `.env` file:

```env
NEXTAUTH_SECRET=your-generated-secret-here
```

4. Configure at least one OAuth provider (see sections below).

## Setting Up OAuth Providers

### Google OAuth

1. **Create OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Navigate to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Select **Web application**
   - Add authorized redirect URIs:
     - Development: `http://localhost:3000/api/auth/callback/google`
     - Production: `https://your-domain.com/api/auth/callback/google`

2. **Configure Environment Variables:**

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXT_PUBLIC_GOOGLE_ENABLED=true
```

### GitHub OAuth

1. **Create OAuth Application:**
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click **New OAuth App**
   - Fill in the application details:
     - **Application name**: ClickHouse Console
     - **Homepage URL**: `http://localhost:3000` (or your domain)
     - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`

2. **Configure Environment Variables:**

```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
NEXT_PUBLIC_GITHUB_ENABLED=true
```

### Microsoft Entra ID OAuth

1. **Register Application:**
   - Go to [Azure Portal](https://portal.azure.com/)
   - Navigate to **Azure Active Directory** → **App registrations**
   - Click **New registration**
   - Fill in the details:
     - **Name**: ClickHouse Console
     - **Supported account types**: Choose based on your needs
     - **Redirect URI**: Select **Web** and enter `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - After creation, note the **Application (client) ID** and **Directory (tenant) ID**

2. **Create Client Secret:**
   - In your app registration, go to **Certificates & secrets**
   - Click **New client secret**
   - Add a description and choose an expiration period
   - Copy the secret value immediately (it won't be shown again)

3. **Configure API Permissions:**
   - Go to **API permissions**
   - Click **Add a permission** → **Microsoft Graph**
   - Select **Delegated permissions**
   - Add: `User.Read`, `openid`, `profile`, `email`
   - Click **Grant admin consent** (if you have admin rights)

4. **Configure Environment Variables:**

```env
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=your-microsoft-tenant-id
NEXT_PUBLIC_MICROSOFT_ENABLED=true
```

## Running the Application

### Development Mode

```bash
npm run dev
```

The application will start at `http://localhost:3000`.

- If authentication is configured, you'll be redirected to the login page
- If no providers are configured, you'll access the console directly

### Production Mode

```bash
npm run build
npm start
```

**Important**: Make sure to update your OAuth redirect URIs in your provider settings to use your production domain.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXTAUTH_SECRET` | Yes (if auth enabled) | Secret key for JWT encryption |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | Optional | Set to "true" to show Google login button |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth client secret |
| `NEXT_PUBLIC_GITHUB_ENABLED` | Optional | Set to "true" to show GitHub login button |
| `MICROSOFT_CLIENT_ID` | Optional | Microsoft client ID |
| `MICROSOFT_CLIENT_SECRET` | Optional | Microsoft client secret |
| `MICROSOFT_TENANT_ID` | Optional | Microsoft tenant ID |
| `NEXT_PUBLIC_MICROSOFT_ENABLED` | Optional | Set to "true" to show Microsoft login button |

## Troubleshooting

### Authentication not working

1. **Check environment variables:**
   - Ensure all required variables are set in `.env`
   - Restart the development server after changing `.env` files

2. **Verify OAuth redirect URIs:**
   - Make sure the callback URLs in your OAuth provider settings match exactly
   - Include the correct protocol (http vs https)
   - Check for trailing slashes

3. **Clear browser cookies:**
   - Authentication state is stored in cookies
   - Clear cookies and try signing in again

### Login page not showing

- Check that at least one `NEXT_PUBLIC_*_ENABLED` variable is set to "true"
- Verify that the corresponding client ID and secret are configured

### "Authentication is not enabled" message

- This means no OAuth providers are configured
- Configure at least one provider to enable authentication
- Make sure both client ID and secret are provided

### Session expires immediately

- Check that `NEXTAUTH_SECRET` is set and is a valid random string
- Ensure cookies are enabled in your browser
- Verify that your system time is correct

### Redirect URI mismatch error

- Double-check the callback URL in your OAuth provider settings
- The format should be: `http://localhost:3000/api/auth/callback/{provider}`
- Provider names: `google`, `github`, `microsoft-entra-id`

## Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use strong, random secrets** for `NEXTAUTH_SECRET`
3. **Rotate client secrets** periodically
4. **Use HTTPS** in production
5. **Restrict OAuth redirect URIs** to your actual domains
6. **Keep dependencies updated** to get security patches

## Additional Resources

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google OAuth Setup Guide](https://support.google.com/cloud/answer/6158849)
- [GitHub OAuth Apps Guide](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Microsoft Identity Platform Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/)

