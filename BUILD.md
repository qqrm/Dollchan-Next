# Reproducing the Firefox package

Mozilla reviewers can reproduce Dollchan Next with a clean Linux checkout.

Requirements:

- Node.js 22
- npm as bundled with Node.js
- Git

Commands:

```sh
npm ci
npm run verify
```

The unpacked extension is written to `dist/firefox`. No downloaded dependency is copied into the extension and no
remote code is loaded at runtime. The build reads the checked-in modules under `src/modules`, inserts the version
from `package.json` (or `BUILD_VERSION` for a signed beta), and records the seven-character source commit.

To produce the source archive used by the AMO workflow:

```sh
npm run build:source
```
