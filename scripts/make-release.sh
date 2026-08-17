#!/usr/bin/env bash
set -euo pipefail

# Build the official dual-face tarball: dsh-skills-manager-<version>.tgz
# Requires a built deepseek-harness checkout (source development only; end
# users consume the generated tarball from GitHub Releases).

HARNESS="${HARNESS:-$HOME/AI_Coding/deepseek-harness}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE="$ROOT/release"
VERSION="${VERSION:-0.1.0-rc.1}"
MERGED="$RELEASE/merged/dsh-skills-manager"

cd "$HARNESS"
corepack pnpm install --silent
corepack pnpm run build:lib:host
corepack pnpm --filter @deepseek-ai/dsh-client-ui-skills-manage run bundle

rm -rf "$MERGED" "$RELEASE/dsh-skills-manager-$VERSION.tgz"
mkdir -p "$MERGED/lib"
cp -a packages/skill/skills-manage/lib/index.js "$MERGED/lib/index.js"
cp -a packages/skill/skills-manage/lib/invariant.js "$MERGED/lib/invariant.js"
cp -a packages/skill/skills-manage/lib/typert.host.js "$MERGED/lib/typert.host.js"
cp -a packages/skill/skills-manage/lib/typert.remote-client.js "$MERGED/lib/typert.remote-client.js"
cp -a packages/skill/skills-manage/lib/types "$MERGED/lib/types"
cp -a packages/client/ui-skills-manage/lib/client.js "$MERGED/lib/client.js"
cp -a packages/client/ui-skills-manage/lib/client.js.map "$MERGED/lib/client.js.map"
mkdir -p "$MERGED/lib/types"
cp -a packages/client/ui-skills-manage/lib/types/client "$MERGED/lib/types/client"
# Drop stale type artifacts from earlier file renames.
rm -f "$MERGED"/lib/types/client/SkillsManageTab.*

# Typert artifacts are generated under the development package name; rebrand
# them to the published dual-face package name.
find "$MERGED/lib" -type f \( -name 'typert.host.js' -o -name 'typert.remote-client.js' -o -name 'typert.host.d.ts' -o -name 'typert.remote-client.d.ts' \) \
  -exec sed -i 's/@deepseek-ai\/dsh-skills-manage/@baikai23333\/dsh-skills-manager/g' {} \;

cat > "$MERGED/cordis.patch.yml" <<'YAML'
# dsh-skills-manager bundle patch.
- insert:
    - id: skills-manager
      name: '@baikai233/dsh-skills-manager'
      config:
        rank: 250
YAML

cat > "$MERGED/package.json" <<'JSON'
{
  "name": "@baikai233/dsh-skills-manager",
  "description": "DSH skill-group manager: import, organize, and switch SKILL.md groups",
  "version": "VERSION_PLACEHOLDER",
  "license": "MIT",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./invariant": { "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" },
    "./types": { "types": "./lib/types/types.d.ts", "default": "./lib/types/types.js" },
    "./typert": { "types": "./lib/typert.host.d.ts", "default": "./lib/typert.host.js" },
    "./remote": { "types": "./lib/typert.remote-client.d.ts", "default": "./lib/typert.remote-client.js" },
    "./package.json": "./package.json"
  },
  "files": ["lib/**/*", "cordis.patch.yml", "package.json"],
  "dependencies": {
    "@deepseek-ai/schemastery": "^3.18.1",
    "yaml": "^2.4.2",
    "zod": "^4.4.3"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-settings": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-skill": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-invariants": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-typert-protocol": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-api-remotes": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-client-locale": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-client-runtime": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-client-ui-primitives": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-client-ui-settings": "^0.1.0-rc.7",
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.0-rc.7",
    "react": "^18.2.0"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-api-remotes",
        "@deepseek-ai/dsh-client-connection"
      ],
      "platform": "web"
    }
  }
}
JSON
sed -i "s/VERSION_PLACEHOLDER/$VERSION/" "$MERGED/package.json"
(cd "$MERGED" && npm pack --silent >/dev/null)
mv "$MERGED"/*.tgz "$RELEASE/dsh-skills-manager-$VERSION.tgz"
echo "built $RELEASE/dsh-skills-manager-$VERSION.tgz"
