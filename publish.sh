#!/usr/bin/env bash
# ============================================================================
#  One Data — publication d'une version de module (tag immuable + registre)
#  Usage : ./publish.sh <module> <version>        ex: ./publish.sh annuaire v3
#  Fait : commit du <module>.js -> push -> tag immuable -> update du registre.
#  À lancer depuis le dossier du repo one-data-modules (clone local).
# ============================================================================
set -euo pipefail

MODULE="${1:?usage: ./publish.sh <module> <version>   (ex: ./publish.sh annuaire v3)}"
VERSION="${2:?usage: ./publish.sh <module> <version>   (ex: ./publish.sh annuaire v3)}"

# --- config (depuis .env, NON commité) --------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SCRIPT_DIR/.env" ] && source "$SCRIPT_DIR/.env"
: "${CP_URL:?CP_URL manquant dans .env (ex https://lerofucjmfrrduohnwet.supabase.co)}"
: "${CP_SERVICE_KEY:?CP_SERVICE_KEY manquant dans .env (service_role du control plane)}"

REPO="oropra/one-data-modules"
FILE="${MODULE}.js"
TAG="${MODULE}-${VERSION}"

[ -f "$FILE" ] || { echo "❌ fichier introuvable : $FILE (es-tu dans le dossier du repo ?)"; exit 1; }

# Immuabilité : on refuse de réutiliser un tag existant
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
    echo "❌ le tag '$TAG' existe déjà. Incrémente la version (les tags sont immuables)."; exit 1
fi

echo "→ commit + push de $FILE …"
git add "$FILE"
git commit -m "publish ${MODULE} ${VERSION}" || echo "  (rien de neuf à committer)"
git push

echo "→ tag immuable $TAG …"
git tag "$TAG"
git push origin "$TAG"

CDN_URL="https://cdn.jsdelivr.net/gh/${REPO}@${TAG}/${FILE}"

echo "→ enregistrement dans le registre (control plane) …"
curl -fsS -X POST "${CP_URL}/rest/v1/rpc/publish_module_version" \
  -H "apikey: ${CP_SERVICE_KEY}" \
  -H "Authorization: Bearer ${CP_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"p_module\":\"${MODULE}\",\"p_label\":\"${VERSION}\",\"p_cdn_url\":\"${CDN_URL}\"}"

echo
echo "✅ ${MODULE} ${VERSION} publié :"
echo "   ${CDN_URL}"
echo "   (tous les clients sur la version par défaut de '${MODULE}' la reçoivent)"
