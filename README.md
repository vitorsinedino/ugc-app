# UGC Video App for Shopify

A Shopify embedded app that allows merchants to upload, manage, and display User Generated Content (UGC) videos on their storefront with a TikTok/Reels-style carousel experience.

## Features

- **Video Management Dashboard**: Upload, edit, and organize UGC videos
- **Multiple Upload Methods**: Drag-and-drop file upload or paste video URL
- **Shopify CDN Hosting**: Videos are stored on Shopify's Files API for fast delivery
- **Creator Attribution**: Credit content creators with their social media handles
- **Theme Extension**: Beautiful video carousel that integrates with any Shopify theme
- **Mobile-First Player**: Vertical video player with swipe navigation, auto-play, and keyboard shortcuts

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development](#development)
3. [Project Structure](#project-structure)
4. [Key Files](#key-files)
5. [How It Works](#how-it-works)
6. [Database Schema](#database-schema)
7. [App Proxy Configuration](#app-proxy-configuration)
8. [Theme Extension](#theme-extension)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.19 (see `engines` in package.json)
- **Shopify Partner Account**: [Create one here](https://partners.shopify.com/signup)
- **Development Store**: [Create a dev store](https://help.shopify.com/en/partners/dashboard/development-stores)
- **Shopify CLI**: Install globally:
  ```bash
  npm install -g @shopify/cli@latest
  ```

### Installation

1. **Clone and install dependencies**:
   ```bash
   cd ugc-app
   npm install
   ```

2. **Set up the database**:
   ```bash
   npm run setup
   ```
   This runs `prisma generate` and `prisma migrate deploy`.

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Install on your store**: Press `P` in the terminal to open the app URL, then click "Install".

---

## Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development with Shopify CLI |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run setup` | Generate Prisma client and run migrations |
| `npm run deploy` | Deploy app configuration to Shopify |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |

### Switching App Configurations

This project supports multiple app configurations for different stores:

```bash
# Link to a specific app config
npm run config:link

# Switch between configs
npm run config:use

# Deploy a specific config
npm run deploy -- --config shopify.app.ugc-app-v1.toml
```

---

## Project Structure

```
ugc-app/
├── app/                              # Main application code
│   ├── routes/                       # React Router routes
│   │   ├── app._index.tsx           # Dashboard (home page)
│   │   ├── app.videos.tsx           # Video management page
│   │   ├── api.videos.tsx           # Public API for storefront
│   │   ├── app.tsx                  # App layout with navigation
│   │   ├── auth.$.tsx               # OAuth authentication
│   │   └── webhooks.*.tsx           # Webhook handlers
│   ├── shopify.server.ts            # Shopify API configuration
│   ├── db.server.ts                 # Prisma database client
│   └── root.tsx                     # HTML root component
│
├── extensions/                       # Shopify extensions
│   └── ugc-video-carousell/         # Theme app extension
│       ├── blocks/
│       │   └── video_carousel.liquid # Carousel block for storefront
│       └── shopify.extension.toml
│
├── prisma/                          # Database
│   ├── schema.prisma                # Database schema
│   ├── migrations/                  # Migration files
│   └── dev.sqlite                   # SQLite database (dev)
│
├── shopify.app.toml                 # Main app configuration
├── shopify.app.ugc-app-v1.toml      # Client store configuration
├── package.json
├── vite.config.ts
└── Dockerfile                       # Docker deployment config
```

---

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `app/shopify.server.ts` | Shopify API initialization, authentication setup |
| `app/db.server.ts` | Prisma client singleton for database access |
| `app/routes/api.videos.tsx` | Public API endpoint for storefront (App Proxy) |
| `app/routes/app.videos.tsx` | Video management UI and CRUD operations |
| `prisma/schema.prisma` | Database schema definition |

### Frontend

| File | Purpose |
|------|---------|
| `app/routes/app._index.tsx` | Dashboard with stats and quick start guide |
| `app/routes/app.videos.tsx` | Video list, upload modal, video management |
| `app/routes/app.tsx` | App layout, navigation bar |

### Storefront

| File | Purpose |
|------|---------|
| `extensions/ugc-video-carousell/blocks/video_carousel.liquid` | Video carousel component for themes |

### Configuration

| File | Purpose |
|------|---------|
| `shopify.app.toml` | App settings, scopes, webhooks, app proxy |
| `shopify.app.ugc-app-v1.toml` | Production/client store configuration |
| `vite.config.ts` | Vite bundler configuration |

---

## How It Works

### Architecture Overview

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Shopify       │      │   Your App       │      │   Shopify       │
│   Admin         │◄────►│   (React Router) │◄────►│   Files API     │
│   (Embedded)    │      │                  │      │   (CDN)         │
└─────────────────┘      └────────┬─────────┘      └─────────────────┘
                                  │
                                  │ App Proxy
                                  ▼
                         ┌──────────────────┐
                         │   Storefront     │
                         │   (Liquid Block) │
                         └──────────────────┘
```

### Video Upload Flow

1. **Merchant opens video management** (`/app/videos`)
2. **Upload initiated**: File drag-drop or URL paste
3. **Staged upload created**: Request upload URL from Shopify
4. **File uploaded**: Direct upload to Shopify CDN
5. **File record created**: Register file with Shopify Files API
6. **Processing**: Poll until video is ready (thumbnail generated)
7. **Save to database**: Store video metadata in `UgcVideo` table

### Storefront Display Flow

1. **Theme editor**: Merchant adds "UGC Video Carousel" block to a page
2. **Page loads**: JavaScript in Liquid block fetches `/apps/ugc-videos`
3. **App Proxy routes request**: Shopify forwards to your app's API
4. **API returns videos**: Active videos for that shop (JSON)
5. **Carousel renders**: Thumbnails displayed in horizontal scroll
6. **User clicks thumbnail**: Modal player opens with vertical video

---

## Database Schema

### Session (Shopify OAuth)

Stores authentication sessions for installed shops.

### UgcVideo

| Field | Type | Description |
|-------|------|-------------|
| `id` | String | Unique identifier (CUID) |
| `shop` | String | Shop domain (e.g., `mystore.myshopify.com`) |
| `title` | String | Video title |
| `description` | String? | Optional description |
| `videoUrl` | String | Shopify CDN URL |
| `thumbnailUrl` | String? | Auto-generated thumbnail URL |
| `duration` | Int? | Duration in seconds |
| `sourceAuthor` | String? | Creator handle (e.g., `@username`) |
| `sourceType` | String? | Source platform (TikTok, Instagram, YouTube, Original) |
| `productId` | String? | Optional linked product ID |
| `sortOrder` | Int | Display order (lower = first) |
| `isActive` | Boolean | Visibility toggle |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Last update timestamp |

---

## App Proxy Configuration

The App Proxy allows your storefront to communicate with your app. It must be configured in your `shopify.app.*.toml`:

```toml
[app_proxy]
url = "https://your-app-url.com/api/videos"
subpath = "ugc-videos"
prefix = "apps"
```

This creates the route: `https://your-store.myshopify.com/apps/ugc-videos`

### Important Notes

- **Development**: When using `npm run dev`, Shopify CLI creates a Cloudflare tunnel. The tunnel URL changes on each restart, so you must update and redeploy the config.
- **Production**: Use a stable URL (Heroku, Railway, Render, etc.)

### Updating App Proxy URL

1. Update `application_url` and `[app_proxy].url` in your TOML file
2. Update `[auth].redirect_urls` to match
3. Deploy: `npm run deploy -- --config your-config.toml`

---

## Theme Extension

The video carousel is a **Theme App Extension** that merchants add via the Shopify Theme Editor.

### Adding to a Theme

1. Go to **Online Store > Themes > Customize**
2. Click **Add section** or **Add block**
3. Select **UGC Video Carousel** (under Apps)
4. Configure settings (title, colors, thumbnail size, etc.)
5. Save

### Customization Options

| Setting | Description |
|---------|-------------|
| Show Header | Toggle header visibility |
| Title | Carousel title text |
| Subtitle | Optional subtitle |
| Header Alignment | Left, center, or right |
| Thumbnail Width (Desktop/Mobile) | Size of video thumbnails |
| Gap | Space between thumbnails |
| Border Radius | Thumbnail corner rounding |
| Primary Color | Accent color for UI elements |
| Background Color | Carousel background |
| Text Color | Title and subtitle color |

### Player Features

- **Auto-play** on open
- **Swipe navigation** (touch devices)
- **Keyboard shortcuts**: Arrow keys, Space (play/pause), M (mute), Escape (close)
- **Progress bar** with seek functionality
- **Creator attribution** overlay
- **Auto-advance** to next video

---

## Deployment

### Environment Variables

For production, set these environment variables:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `SHOPIFY_API_KEY` | Your app's API key |
| `SHOPIFY_API_SECRET` | Your app's API secret |

### Using Docker

```bash
# Build
docker build -t ugc-app .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e SHOPIFY_API_KEY="..." \
  -e SHOPIFY_API_SECRET="..." \
  ugc-app
```

### Recommended Hosting Providers

- **[Railway](https://railway.app/)** - Easy deployment with PostgreSQL
- **[Render](https://render.com/)** - Free tier available
- **[Fly.io](https://fly.io/)** - Global edge deployment
- **[Google Cloud Run](https://cloud.google.com/run)** - Scalable containerized hosting

### Production Database

For production, switch from SQLite to PostgreSQL:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Set `DATABASE_URL` environment variable

3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

---

## Troubleshooting

### Videos not loading on storefront (404 error)

**Cause**: App Proxy not configured or URL mismatch.

**Solution**:
1. Ensure `[app_proxy]` section exists in your TOML config
2. Verify the URL matches your app's actual URL
3. Redeploy: `npm run deploy -- --config your-config.toml`

### "Unexpected end of JSON input" error

**Cause**: App Proxy returning empty response or HTML error page.

**Solution**: Check that your app server is running and the API route (`/api/videos`) is accessible.

### Cloudflare tunnel URL changed

**Cause**: Restarting `npm run dev` creates a new tunnel URL.

**Solution**:
1. Copy the new URL from the terminal
2. Update all URLs in your TOML config
3. Redeploy the config

### Database tables don't exist

**Solution**: Run the setup script:
```bash
npm run setup
```

### Videos stuck in "processing"

**Cause**: Shopify taking time to process video, or processing failed.

**Solution**:
- Wait a few minutes and refresh
- Check video format (MP4 recommended)
- Check file size (max 250MB)

---

## API Reference

### Public API (Storefront)

#### GET `/apps/ugc-videos`

Returns active videos for the current shop.

**Response**:
```json
{
  "videos": [
    {
      "id": "clx...",
      "title": "Product Demo",
      "description": "Amazing product showcase",
      "videoUrl": "https://cdn.shopify.com/videos/...",
      "thumbnailUrl": "https://cdn.shopify.com/...",
      "duration": 30,
      "sourceAuthor": "@creator",
      "sourceType": "TikTok",
      "productId": null
    }
  ]
}
```

---

## Tech Stack

- **Framework**: [React Router v7](https://reactrouter.com/) (formerly Remix)
- **UI Components**: [Shopify Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components)
- **Database**: [Prisma](https://www.prisma.io/) with SQLite (dev) / PostgreSQL (prod)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Shopify SDK**: [@shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router)

---

## Resources

- [Shopify App Development](https://shopify.dev/docs/apps/getting-started)
- [React Router Documentation](https://reactrouter.com/home)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Shopify App Proxy](https://shopify.dev/docs/apps/online-store/app-proxies)
- [Theme App Extensions](https://shopify.dev/docs/apps/online-store/theme-app-extensions)
