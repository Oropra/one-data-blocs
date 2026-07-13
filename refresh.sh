#!/usr/bin/env bash
# ============================================================================
#  Dev rapide (sans tag) : commit + push + purge jsDelivr @main.
#  À utiliser SEULEMENT pendant qu'on met au point un module dont le registre
#  pointe temporairement @main. Quand c'est bon -> ./publish.sh <module> <vX>.
#  Usage : ./refresh.sh <module>
# ============================================================================
set -euo pipefail
MODULE="${1:?usage: ./refresh.sh <module>}"
REPO="oropra/one-data-modules"
FILE="${MODULE}.js"

[ -f "$FILE" ] || { echo "❌ fichier introuvable : $FILE"; exit 1; }
git add "$FILE"; git commit -m "wip ${MODULE}" || echo "  (rien à committer)"; git push
echo "→ purge jsDelivr @main …"
curl -fsS "https://purge.jsdelivr.net/gh/${REPO}@main/${FILE}" >/dev/null && echo "  purge OK"
echo "✅ recharge l'app (Ctrl+Shift+R). Registre doit pointer @main pour '${MODULE}'."
