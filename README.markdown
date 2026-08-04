# Dollchan Next

Dollchan Next is an independent, modernised fork of
[Dollchan Extension Tools](https://github.com/SthephanShinkufag/Dollchan-Extension-Tools) for Firefox and
Firefox-based browsers such as Zen.

The extension improves imageboard navigation, posting, media handling and content filtering. This fork adds
persistent exact and fuzzy text rules, perceptual image matching, cached rule evaluation and multiple hotkey
bindings per action. It also replaces the legacy interface and distribution pipeline.

## Install

The public AMO build will be linked here after Mozilla approves version 1.0.0. Signed beta XPI files are attached
to GitHub prereleases and must be reinstalled for each beta update.

Do not enable Dollchan Next and the original Dollchan extension on the same imageboard page. Export the original
configuration as JSON, then import it from **Dollchan Next → Settings → Import & export**.

## Privacy

Dollchan Next has no analytics or telemetry. Core features communicate with the imageboard selected by the user.
Optional YouTube/Vimeo metadata and image-search integrations are disabled until explicit consent is stored.
See [PRIVACY.md](PRIVACY.md) for the complete data-flow description.

## Development

Requirements: Node.js 22 and npm.

```sh
npm ci
npm run verify
npm run start:firefox
```

`npm run build:firefox` creates the reviewable extension tree in `dist/firefox` without changing tracked source
files. Detailed AMO reproduction instructions are in [BUILD.md](BUILD.md).

## Upstream and license

The repository remains a GitHub fork and keeps `SthephanShinkufag/Dollchan-Extension-Tools` as `upstream`.
Upstream changes are imported manually and reviewed for conflicts.

Dollchan Next is distributed under the MIT License. The original copyright and permission notice are preserved in
[LICENSE](LICENSE), with derivative-work attribution in [NOTICE](NOTICE).
