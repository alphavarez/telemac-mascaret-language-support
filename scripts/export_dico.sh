#!/usr/bin/env bash
# Exports the official .dico files of one TELEMAC-MASCARET release from a git
# clone of https://gitlab.pam-retd.fr/otm/telemac-mascaret into a folder, ready
# to be copied into this extension's dico/<version>/ folder.
#
# Usage:
#   scripts/export_dico.sh <release tag> <output folder> [telemac clone]
#
# Examples:
#   scripts/export_dico.sh v9.1.2 dico/9.1.2 ~/telemac/source
#   scripts/export_dico.sh v8p4r1 dico/8p4   ~/telemac/source
#
# The clone is only read (git ls-tree / git show); the installation is not
# modified. Run `git -C <clone> fetch --tags` first to get new release tags.
set -euo pipefail

TAG="${1:?release tag, e.g. v9.1.2}"
OUT="${2:?output folder, e.g. dico/9.1.2}"
CLONE="${3:-${HOMETEL:-$HOME/telemac/source}}"

if ! git -C "$CLONE" rev-parse --verify --quiet "$TAG^{commit}" >/dev/null; then
    echo "Tag $TAG not found in $CLONE. Available release tags:" >&2
    git -C "$CLONE" tag -l 'v*' | sort -V | tail -15 >&2
    exit 1
fi

mkdir -p "$OUT"
count=0
while IFS= read -r f; do
    git -C "$CLONE" show "$TAG:$f" > "$OUT/$(basename "$f")"
    count=$((count + 1))
done < <(git -C "$CLONE" ls-tree -r --name-only "$TAG" sources | grep '\.dico$')

echo "$TAG: $count dico files written to $OUT"
for f in "$OUT"/*.dico; do
    printf '  %-16s %4d keywords\n' "$(basename "$f")" "$(grep -c '^NOM1' "$f")"
done
