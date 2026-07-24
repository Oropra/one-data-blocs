#!/usr/bin/env bash
# ============================================================================
#  One Data — publication d'une version de module (SHA immuable + registre)
#  Usage : ./publish.sh <module> <version>        ex: ./publish.sh dashboard v5
#
#  Corrections vs la version précédente :
#   1. REPO = Oropra/one-data-blocs  (l'ancien 'oropra/one-data-modules' EXISTE
#      TOUJOURS et sert un contenu différent -> URL CDN vers du code périmé).
#   2. L'URL CDN est bâtie sur le SHA du commit, pas sur le tag : jsDelivr rend
#      des 404 durables sur les tags fraîchement poussés de ce repo. Un SHA est
#      immuable, unique par version, et cacheable sans purge.
#   3. VÉRIFICATION du CDN avant d'écrire au registre. C'est le garde-fou :
#      plus jamais d'URL cassée enregistrée comme version par défaut.
#  Le tag est conservé (historique + rollback lisible).
# ============================================================================
set -euo pipefail

MODULE="${1:?usage: ./publish.sh <module> <version>   (ex: ./publish.sh dashboard v5)}"
VERSION="${2:?usage: ./publish.sh <module> <version>   (ex: ./publish.sh dashboard v5)}"

# --- config (depuis .env, NON commité) --------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SCRIPT_DIR/.env" ] && source "$SCRIPT_DIR/.env"
: "${CP_URL:?CP_URL manquant dans .env (ex https://lerofucjmfrrduohnwet.supabase.co)}"
: "${CP_SERVICE_KEY:?CP_SERVICE_KEY manquant dans .env (service_role du control plane)}"

REPO="Oropra/one-data-blocs"
FILE="${MODULE}.js"
TAG="${MODULE}-${VERSION}"

[ -f "$FILE" ] || { echo "❌ fichier introuvable : $FILE (es-tu dans le dossier du repo ?)"; exit 1; }

# Garde-fou : le module doit au moins être du JS valide
if command -v node >/dev/null 2>&1; then
  node -c "$FILE" || { echo "❌ $FILE ne compile pas (node -c). Publication annulée."; exit 1; }
fi

# Garde-fou : aucun secret / URL de tenant en dur
if grep -qE 'eyJhbGciOiJIUzI1NiI|sb_secret_|esehlhlrqcsfszunpjrt' "$FILE"; then
  echo "❌ $FILE contient un secret ou une URL de tenant en dur. Publication annulée."; exit 1
fi

# Immuabilité : on refuse de réutiliser un tag existant
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
    echo "❌ le tag '$TAG' existe déjà. Incrémente la version (les tags sont immuables)."; exit 1
fi

echo "→ commit + push de $FILE …"
git add "$FILE"
git commit -m "publish ${MODULE} ${VERSION}" || echo "  (rien de neuf à committer)"
git push

echo "→ tag $TAG (historique / rollback) …"
git tag "$TAG"
git push origin "$TAG"

SHA="$(git rev-parse HEAD)"
CDN_URL="https://cdn.jsdelivr.net/gh/${REPO}@${SHA}/${FILE}"

# --- VÉRIFICATION CDN avant d'écrire quoi que ce soit au registre ------------
echo "→ vérification du CDN (jsDelivr doit servir le fichier) …"
OK=0
for i in $(seq 1 20); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$CDN_URL" || true)"
  if [ "$CODE" = "200" ]; then OK=1; echo "  ✅ CDN OK (tentative $i)"; break; fi
  echo "  … pas encore prêt (HTTP $CODE) — nouvelle tentative dans 6 s"
  sleep 6
done
if [ "$OK" != "1" ]; then
  echo "❌ le CDN ne sert pas $CDN_URL"
  echo "   Le registre n'a PAS été modifié : les clients restent sur la version précédente."
  echo "   (git push et tag sont faits ; relance le script ou vérifie jsDelivr.)"
  exit 1
fi

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
