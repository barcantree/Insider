# Insider

An Obsidian plugin that turns YouTube videos, web pages, PDFs, and direct questions into structured knowledge notes, then automatically links them to related ideas across your vault.

Powered by [DeepSeek](https://platform.deepseek.com/) (OpenAI-compatible API).

## Install

### Community Plugins (recommended)

Once listed in the Obsidian catalog, search for **Insider** under **Settings → Community plugins → Browse** and install with one click.

### Manual install

1. Download `manifest.json`, `main.js`, and `styles.css` from the [latest release](https://github.com/barcantree/insider/releases).
2. Copy them into `<Vault>/.obsidian/plugins/insider/`.
3. Enable **Insider** under **Settings → Community plugins**.

### Local development

```bash
./install-to-vault.sh /path/to/your/ObsidianVault
```

Or build manually:

```bash
npm install
npm run build
cp manifest.json main.js styles.css /path/to/vault/.obsidian/plugins/insider/
```

## Setup

1. **Settings → Insider** — enter your DeepSeek API key and output folder (default `To-Process`).
2. Open the sidebar via the **sparkles ribbon icon** or the command **Open Insider sidebar**.

Settings persist automatically in `<Vault>/.obsidian/plugins/insider/data.json`.

## Features

### Generate from URL or PDF

Paste a YouTube, Reddit, X/Twitter, or PDF URL (or a vault PDF path). Optionally add instructions. Insider fetches the source, generates a report or summary, and writes a new note.

### Ask a question

Enter a question to generate a standalone research report as a new vault note.

### Related notes

- **Keyword mode** — fast overlap-based matching with AI lens/reason validation.
- **Semantic snapshot mode** — scans your vault into compact AI snapshots, then finds deeper connections.

Enable **Compare with existing notes** and choose the algorithm in the sidebar Options panel.

**Refresh semantic snapshots** appears only when compare is on and algorithm is set to semantic snapshot.

### Supported sources

| Source | Behavior |
|--------|----------|
| YouTube | Transcript via InnerTube API; optional timestamps and audio-cue stripping |
| Reddit | Public JSON endpoint for post + top comments |
| X/Twitter | API v2 (requires bearer token in settings) |
| PDF | URL or vault-local path |
| Question | Standalone research report (no URL fetch) |

## Development

```bash
npm install
npm run dev    # watch mode — rebuilds main.js on save
npm run build  # production build
```

Reload Obsidian (or disable/re-enable the plugin) after rebuilding.

## Releasing

1. Bump `version` in `manifest.json`, `package.json`, and `versions.json`.
2. Run `npm run build`.
3. Commit `main.js` and manifest changes.
4. Create a GitHub release tagged exactly the version number (e.g. `1.0.0`, no `v` prefix).
5. Attach `manifest.json`, `main.js`, and `styles.css` to the release.

## License

See [LICENSE](LICENSE).
