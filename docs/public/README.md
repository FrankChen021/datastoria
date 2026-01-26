# Public Assets for SEO

This directory contains public assets that are referenced in the documentation for SEO and social sharing purposes.

## Required Images for Optimal SEO

Please create and add the following image files to this directory:

### 1. Open Graph Image (Social Sharing)
- **File**: `og-image.png`
- **Size**: 1200x630 pixels
- **Format**: PNG or JPG
- **Purpose**: Used when sharing links on social media (Facebook, LinkedIn, Twitter, etc.)
- **Content**: Should showcase DataStoria's main features with branding

### 2. Favicon
- **File**: `favicon.ico`
- **Size**: 32x32 pixels (multi-size ICO recommended: 16x16, 32x32, 48x48)
- **Format**: ICO
- **Purpose**: Browser tab icon

### 3. SVG Icon
- **File**: `icon.svg`
- **Format**: SVG
- **Purpose**: Modern browsers' favicon (scalable)

### 4. Apple Touch Icon
- **File**: `apple-touch-icon.png`
- **Size**: 180x180 pixels
- **Format**: PNG
- **Purpose**: iOS home screen icon

### 5. PWA Icons
- **File**: `icon-192.png`
- **Size**: 192x192 pixels
- **Format**: PNG
- **Purpose**: Progressive Web App icon (small)

- **File**: `icon-512.png`
- **Size**: 512x512 pixels
- **Format**: PNG
- **Purpose**: Progressive Web App icon (large)

## Current Assets

- ✅ `logo.png` - DataStoria logo
- ✅ `demo.gif` - Demo animation
- ✅ `robots.txt` - Search engine crawling rules
- ✅ `site.webmanifest` - PWA manifest

## Creating the Open Graph Image

The Open Graph image is the most important for social sharing. It should include:

1. **DataStoria branding/logo**
2. **Tagline**: "AI-Powered ClickHouse Management Console"
3. **Key features** (optional): Natural Language Queries, Query Optimization, Cluster Management
4. **Visual elements**: Consider including a screenshot or graphic representation
5. **Color scheme**: Match your brand colors (blue theme: #3b82f6)

### Design Tips:
- Keep text large and readable (minimum 60px font size)
- Use high contrast for text visibility
- Leave safe margins (avoid text near edges)
- Test how it looks when cropped to square (for some platforms)
- Export at 2x resolution for retina displays

## Quick Generation Options

### Option 1: Using Figma/Canva
1. Create a 1200x630px canvas
2. Add DataStoria branding and text
3. Export as PNG

### Option 2: Using ImageMagick (Command Line)
```bash
# Create a simple OG image with text
convert -size 1200x630 xc:'#3b82f6' \
  -font Arial-Bold -pointsize 72 -fill white \
  -gravity center -annotate +0-100 'DataStoria' \
  -pointsize 36 -annotate +0+50 'AI-Powered ClickHouse Console' \
  og-image.png
```

### Option 3: Using Online Tools
- [Canva](https://www.canva.com/) - Free design tool
- [Figma](https://www.figma.com/) - Professional design tool
- [OG Image Generator](https://og-image.vercel.app/) - Quick OG image creation

## Favicon Generation

Use [Favicon.io](https://favicon.io/) or [RealFaviconGenerator](https://realfavicongenerator.net/) to generate all favicon formats from your logo.

## Validation

After adding images, validate your SEO setup:

1. **Open Graph**: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
2. **Twitter Cards**: [Twitter Card Validator](https://cards-dev.twitter.com/validator)
3. **General SEO**: [Google Rich Results Test](https://search.google.com/test/rich-results)
4. **Structured Data**: [Schema Markup Validator](https://validator.schema.org/)

## Notes

- All images should be optimized for web (use tools like TinyPNG or ImageOptim)
- Consider creating multiple OG images for different sections if needed
- Update the `og:image` meta tags in `.vitepress/config.ts` if you use different filenames
