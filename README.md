# RaveDial Archive Explorer

**RaveDial** is a public, open-source interface for discovering and playing rave-history recordings preserved in the Internet Archive item [`RaveDownloads`](https://archive.org/details/RaveDownloads).

The app does not rehost audio. It builds a searchable catalog from Internet Archive metadata and streams each recording from its original archival URL.

## First release

- Search across recording titles and archive paths
- Filter by detected year, audio format, and source folder
- Sort by archive order, title, year, or file size
- Persistent audio player with previous/next controls
- Local favorites and a browser-stored play queue
- Random-tape mode
- Responsive desktop and mobile design
- Automated weekly metadata refresh and GitHub Pages deployment
- Direct provenance links to every source recording

## Architecture

```text
Internet Archive metadata endpoint
              │
              ▼
 scripts/build-catalog.mjs
              │
              ▼
 _site/data/catalog.json
              │
              ▼
 Static HTML/CSS/JavaScript app
              │
              ▼
 Audio streamed from archive.org
```

The GitHub Actions workflow builds the catalog during deployment, so the repository does not need to store a large generated index.

## Local development

The committed `data/catalog.json` is intentionally empty. Build it before opening the site locally:

```bash
node scripts/build-catalog.mjs data/catalog.json
python -m http.server 8080
```

Then open `http://localhost:8080`.

Node.js 20 or newer is recommended because the catalog builder uses the built-in `fetch` API.

## GitHub Pages

After merging the initial pull request:

1. Open **Settings → Pages** in this repository.
2. Set **Source** to **GitHub Actions**.
3. Run **Build catalog and deploy GitHub Pages** from the Actions tab, or push to `main`.

The workflow also refreshes the deployed catalog every Monday.

## Rights and provenance

RaveDial is an independent discovery interface. Recording copyrights and related rights remain with their respective holders. The interface should never imply that every file in the source archive is public domain. Each recording links directly to its Internet Archive source.

## License

The RaveDial application code is released under the [MIT License](LICENSE). This license applies to the software in this repository, not to third-party recordings or archival media.
