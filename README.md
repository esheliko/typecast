# Typecast

Find out where you know actors from, keep a list of what you watch, and see where to stream it. A single-file web app that installs on your phone (PWA).

- `index.html` is the app. It calls the TMDB API directly from the browser.
- `manifest.webmanifest`, `sw.js` and `icons/` make it installable and give it an offline app shell.
- `artifact.html` is the earlier claude.ai artifact version (Claude answers lookups instead of TMDB).

## Run it

1. Create a free account at themoviedb.org and request an API key under Settings, then API.
2. Serve this folder over HTTP, for example `python3 -m http.server 8000`, and open http://localhost:8000.
3. Open the Setup tab, paste your **API Read Access Token**, pick your country and your streaming services.

The token is stored only in your browser (localStorage). It is never committed.

## Deploy to GitHub Pages

1. Merge to `main`.
2. In the repository, open Settings, then Pages, and set Source to **GitHub Actions**.
3. `.github/workflows/pages.yml` publishes the site. Open the URL on your phone and install:
   - iPhone: Safari, Share, Add to Home Screen.
   - Android: Chrome menu, Install app.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data is provided by JustWatch.
