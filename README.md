# QR Studio

Free, privacy-friendly QR code generator and scanner that runs entirely in the browser — no signup, no server-side processing.

**Live site:** https://qrstudiogen.netlify.app/

## Features

- Generate QR codes for links, text, Wi-Fi, and contacts
- Scan QR codes using your device camera
- Installable as a PWA (works offline via service worker)
- Multi-language support (`js/i18n.js`)

## Project structure

```
.
├── index.html              # Main app (generator + scanner)
├── privacy-policy.html     # Privacy policy
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service worker (offline support)
├── sitemap.xml / robots.txt
├── css/style.css
├── js/
│   ├── app.js               # Core app logic
│   ├── i18n.js               # Translations
│   └── lib/                  # Third-party libs (jsQR, qrcode.js)
├── icons/                   # PWA icons
└── blog/                    # SEO content pages
```

## Development

This is a static site — no build step required. Open `index.html` directly in a browser, or serve the folder with any static file server:

```bash
npx serve .
```

## Deployment

Deploys automatically to [Netlify](https://www.netlify.com/) on every push to `main`.
