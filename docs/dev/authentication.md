# Authentication Setup Guide

DataStoria supports optional authentication using NextAuth.js with OAuth providers. This guide will help you set up Google, GitHub, and/or Microsoft authentication.

---

## Table of Contents

- [Authentication Setup Guide](#authentication-setup-guide)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
    - [1. Generate Secret](#1-generate-secret)
    - [2. Create `.env` file](#2-create-env-file)
    - [3. Configure OAuth Callback URLs](#3-configure-oauth-callback-urls)
  - [Configuration](#configuration)
  - [Setting Up OAuth Providers](#setting-up-oauth-providers)
    - [Google OAuth](#google-oauth)
    - [GitHub OAuth](#github-oauth)
    - [Microsoft Entra ID OAuth](#microsoft-entra-id-oauth)
  - [Running the Application](#running-the-application)
    - [Development Mode](#development-mode)
    - [Production Mode](#production-mode)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
  - [Security Best Practices](#security-best-practices)
  - [Additional Resources](#additional-resources)

---

## Overview

Authentication is **optional** in DataStoria. If no OAuth providers are configured, the application will run without authentication and users can access it directly.

**`ALLOW_ANONYMOUS_USER`** controls whether anonymous users can access the app:
- `true` or unset (default): Anonymous users are allowed; authentication is optional
- `false`: Authentication is required; anonymous users are redirected to login. **Requires at least one OAuth provider**—the app will exit with an error if none are configured

When authentication is enabled:
- Users must sign in before accessing the console (when `ALLOW_ANONYMOUS_USER=false`)
- Multiple OAuth providers can be enabled simultaneously
- User sessions are maintained with JWT tokens
- Sessions last for 7 days by default

---

## Prerequisites

- Node.js 18+ installed
- A domain or localhost for development
- OAuth application credentials from your chosen provider(s)

---

## Quick Start

### 1. Generate Secret

```bash
openssl rand -base64 32
```

### 2. Create `.env` file

```bash
cp .env.example .env
```

Add the generated secret and at least one provider configuration to your `.env` file:

```env
NEXTAUTH_SECRET=<paste-your-secret-here>

# Example for Google OAuth (provider is enabled when credentials are set AND NEXTAUTH_GOOGLE_ENABLED=true):
NEXTAUTH_GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Configure OAuth Callback URLs

In your OAuth provider settings, add:

- **Google**: `http://localhost:3000/api/auth/callback/google`
- **GitHub**: `http://localhost:3000/api/auth/callback/github`
- **Microsoft**: `http://localhost:3000/api/auth/callback/microsoft-entra-id`

---

## Configuration

### Anonymous Access

Set `ALLOW_ANONYMOUS_USER=false` in your `.env` to require authentication. When set to `false`, at least one OAuth provider must be configured or the application will exit with an error.

```env
# Allow anonymous users (default)
ALLOW_ANONYMOUS_USER=true

# Require authentication
ALLOW_ANONYMOUS_USER=false
```

### Provider Setup

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

---

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
NEXTAUTH_GOOGLE_ENABLED=true
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### GitHub OAuth

1. **Create OAuth Application:**
   - Go to [GitHub Developer Settings](https://github.com/settings/developers)
   - Click **New OAuth App**
   - Fill in the application details:
     - **Application name**: DataStoria
     - **Homepage URL**: `http://localhost:3000` (or your domain)
     - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`

2. **Configure Environment Variables:**

```env
NEXTAUTH_GITHUB_ENABLED=true
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### Microsoft Entra ID OAuth

1. **Register Application:**
   - Go to [Azure Portal](https://portal.azure.com/)
   - Navigate to **Azure Active Directory** → **App registrations**
   - Click **New registration**
   - Fill in the details:
     - **Name**: DataStoria
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
NEXTAUTH_MICROSOFT_ENABLED=true
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_TENANT_ID=your-microsoft-tenant-id
```

---

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

---

## Troubleshooting

### Common Issues

- **"Authentication is not enabled"**: Add OAuth credentials to `.env` and restart the server.
- **"Redirect URI mismatch"**: Ensure callback URLs match exactly, including protocol.
- **Login page shows no buttons**: Set `NEXTAUTH_*_ENABLED=true` and ensure `CLIENT_ID` and `CLIENT_SECRET` (and `TENANT_ID` for Microsoft) are configured for your provider(s).
- **Session expires immediately**: Check `NEXTAUTH_SECRET` and ensure cookies are enabled.

---

## Security Best Practices

1. **Never commit `.env` files** to version control.
2. **Use strong, random secrets** for `NEXTAUTH_SECRET`.
3. **Rotate client secrets** periodically.
4. **Use HTTPS** in production.
5. **Restrict OAuth redirect URIs** to your actual domains.
6. **Keep dependencies updated** to get security patches.

---

## Additional Resources

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Google OAuth Setup Guide](https://support.google.com/cloud/answer/6158849)
- [GitHub OAuth Apps Guide](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Microsoft Identity Platform Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/)

