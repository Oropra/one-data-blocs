#!/usr/bin/env bash
# ============================================================================
#  Dev rapide (sans tag) : commit + push + purge jsDelivr @main.
#  À utiliser SEULEMENT pendant qu'on met au point un module dont le registre
#  pointe temporairement @main. Quand c'est bon -> ./publish.sh <module> <vX>.
#  Usage : ./refresh.sh <module>
#
#  Correction : REPO = Oropra/one-data-blocs (l'ancien 'oropra/one-data-modules'
#  existe toujours et sert un contenu différent -> on purgeait le mauvais repo).
# ============================================================================
set -euo pipefail
MODULE="${1:?usage: ./refresh.sh <module>}"
REPO="Oropra/one-data-blocs"
FILE="${MODULE}.js"

[ -f "$FILE" ] || { echo "❌ fichier introuvable : $FILE"; exit 1; }

if command -v node >/dev/null 2>&1; then
  node -c "$FILE" || { echo "❌ $FILE ne compile pas (node -c)."; exit 1; }
fi
if grep -qE 'eyJhbGciOiJIUzI1NiI|sb_secret_|esehlhlrqcsfszunpjrt' "$FILE"; then
  echo "❌ $FILE contient un secret ou une URL de tenant en dur."; exit 1
fi

git add "$FILE"; git commit -m "wip ${MODULE}" || echo "  (rien à committer)"; git push

echo "→ purge jsDelivr @main …"
curl -fsS "https://purge.jsdelivr.net/gh/${REPO}@main/${FILE}" >/dev/null && echo "  purge OK"

echo "→ vérification du CDN …"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "https://cdn.jsdelivr.net/gh/${REPO}@main/${FILE}" || true)"
echo "  HTTP ${CODE}"

echo "✅ recharge l'app (Ctrl+Shift+R). Registre doit pointer @main pour '${MODULE}'."
