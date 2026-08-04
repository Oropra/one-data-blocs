#!/usr/bin/env bash
# ============================================================================
#  One Data — publication d'une version de module (SHA immuable + registre)
#
#  Usage :
#    ./publish.sh <module> <version> [options]
#
#  Options :
#    --no-default        publie SANS promouvoir la version en défaut.
#                        Les clients non épinglés restent où ils sont.
#                        (remplace les 2 requêtes à rejouer pour 'onboarding')
#    --pin <slug>        épingle ce tenant sur la version publiée
#    --unpin <slug>      détache ce tenant (il resuit la version par défaut)
#    --republish         autorise la publication alors que le fichier n'a pas
#                        changé (reprise après un échec de vérification CDN)
#
#  Exemples :
#    ./publish.sh dashboard v6                          # tout le monde
#    ./publish.sh propale_vo v9 --no-default --pin team-colin   # un seul client
#    ./publish.sh onboarding v7 --no-default            # module interne OROPRA
#
#  Garde-fous : node -c, aucun secret en dur, tag immuable, CDN vérifié AVANT
#  d'écrire au registre, et refus de republier un fichier inchangé.
# ============================================================================
set -euo pipefail

MODULE="${1:?usage: ./publish.sh <module> <version> [--no-default] [--pin <slug>]}"
VERSION="${2:?usage: ./publish.sh <module> <version> [--no-default] [--pin <slug>]}"
shift 2

SET_DEFAULT=1
REPUBLISH=0
PIN=""
UNPIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-default) SET_DEFAULT=0; shift ;;
    --republish)  REPUBLISH=1; shift ;;
    --pin)        PIN="${2:?--pin attend un slug}"; shift 2 ;;
    --unpin)      UNPIN="${2:?--unpin attend un slug}"; shift 2 ;;
    *) echo "❌ option inconnue : $1"; exit 1 ;;
  esac
done

# --- config (depuis .env, NON commité) --------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SCRIPT_DIR/.env" ] && source "$SCRIPT_DIR/.env"
: "${CP_URL:?CP_URL manquant dans .env (ex https://lerofucjmfrrduohnwet.supabase.co)}"
: "${CP_SERVICE_KEY:?CP_SERVICE_KEY manquant dans .env (service_role du control plane)}"

REPO="Oropra/one-data-blocs"
FILE="${MODULE}.js"
TAG="${MODULE}-${VERSION}"

cp_curl() { curl -fsS "$@" \
  -H "apikey: ${CP_SERVICE_KEY}" \
  -H "Authorization: Bearer ${CP_SERVICE_KEY}" \
  -H "Content-Type: application/json"; }

# lit une valeur texte dans une réponse JSON (objet ou tableau d'un élément)
jval() {  # $1 = clé, $2 = json
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$2" | jq -r "(if type==\"array\" then .[0] else . end).$1 // empty"
  else
    printf '%s' "$2" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^,\"}]*\)\"\{0,1\}.*/\1/p"
  fi
}

[ -f "$FILE" ] || { echo "❌ fichier introuvable : $FILE (es-tu dans le dossier du repo ?)"; exit 1; }

# Garde-fou : le module doit au moins être du JS valide
if command -v node >/dev/null 2>&1; then
  node -c "$FILE" || { echo "❌ $FILE ne compile pas (node -c). Publication annulée."; exit 1; }
fi

# Garde-fou : aucun secret / URL de tenant en dur
if grep -qE 'eyJhbGciOiJIUzI1NiI|sb_secret_|esehlhlrqcsfszunpjrt' "$FILE"; then
  echo "❌ $FILE contient un secret ou une URL de tenant en dur. Publication annulée."; exit 1
fi

# Garde-fou : le fichier a-t-il réellement changé ?
# (« rien de neuf à committer » = tu republies l'ancien code sous un nouveau nom)
if git diff --quiet -- "$FILE" && git diff --cached --quiet -- "$FILE"; then
  if [ "$REPUBLISH" != "1" ]; then
    echo "❌ $FILE est identique à la version committée : il n'y a rien à publier."
    echo "   Soit ton correctif n'est pas enregistré (vérifie : grep -n '<ton correctif>' $FILE),"
    echo "   soit tu reprends un run interrompu — dans ce cas : --republish"
    exit 1
  fi
  echo "⚠️  fichier inchangé, publication forcée (--republish)"
fi

# Immuabilité : un tag existant n'est réutilisable que s'il pointe déjà sur HEAD
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  if [ "$(git rev-parse "refs/tags/$TAG^{commit}")" = "$(git rev-parse HEAD)" ]; then
    echo "ℹ️  tag $TAG déjà posé sur ce commit — reprise du run."
  else
    echo "❌ le tag '$TAG' existe déjà sur un autre commit. Incrémente la version."; exit 1
  fi
  TAG_EXISTS=1
else
  TAG_EXISTS=0
fi

echo "→ commit + push de $FILE …"
git add "$FILE"
git commit -m "publish ${MODULE} ${VERSION}" || echo "  (rien de neuf à committer)"
git push

if [ "$TAG_EXISTS" = "0" ]; then
  echo "→ tag $TAG (historique / rollback) …"
  git tag "$TAG"
  git push origin "$TAG"
fi

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
  echo "   (git push et tag sont faits ; relance avec --republish.)"
  exit 1
fi

# --- publication au registre ------------------------------------------------
# p_make_default = false : la version est enregistrée mais PAS promue.
# Les clients non épinglés restent où ils sont (et 'onboarding' garde son null).
if [ "$SET_DEFAULT" = "1" ]; then MAKE_DEFAULT=true; else MAKE_DEFAULT=false; fi

echo "→ enregistrement dans le registre (control plane) …"
RESP="$(cp_curl -X POST "${CP_URL}/rest/v1/rpc/publish_module_version" \
  -d "{\"p_module\":\"${MODULE}\",\"p_label\":\"${VERSION}\",\"p_cdn_url\":\"${CDN_URL}\",\"p_make_default\":${MAKE_DEFAULT}}")"

# la RPC renvoie {module, label, version_id, cdn_url, default}
VERSION_ID="$(jval version_id "$RESP")"
[ -n "$VERSION_ID" ] || { echo "❌ réponse inattendue du registre : $RESP"; exit 1; }

if [ -n "$PIN" ]; then
  echo "→ épinglage de '${PIN}' sur ${VERSION} …"
  TENANT_ID="$(jval id "$(cp_curl "${CP_URL}/rest/v1/tenant?slug=eq.${PIN}&select=id")")"
  [ -n "$TENANT_ID" ] || { echo "❌ tenant '${PIN}' introuvable au control plane"; exit 1; }
  cp_curl -X POST "${CP_URL}/rest/v1/tenant_module" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    -d "{\"tenant_id\":${TENANT_ID},\"module_key\":\"${MODULE}\",\"version_id\":\"${VERSION_ID}\"}" >/dev/null
  echo "  ✅ ${PIN} → ${MODULE} ${VERSION} (les autres clients ne bougent pas)"
fi

if [ -n "$UNPIN" ]; then
  echo "→ détachement de '${UNPIN}' …"
  TENANT_ID="$(jval id "$(cp_curl "${CP_URL}/rest/v1/tenant?slug=eq.${UNPIN}&select=id")")"
  [ -n "$TENANT_ID" ] || { echo "❌ tenant '${UNPIN}' introuvable au control plane"; exit 1; }
  cp_curl -X DELETE "${CP_URL}/rest/v1/tenant_module?tenant_id=eq.${TENANT_ID}&module_key=eq.${MODULE}" >/dev/null
  echo "  ✅ ${UNPIN} resuit désormais la version par défaut"
fi

echo
echo "✅ ${MODULE} ${VERSION} publié :"
echo "   ${CDN_URL}"
if [ "$SET_DEFAULT" = "1" ]; then
  echo "   → version par DÉFAUT : tous les clients non épinglés la reçoivent"
else
  echo "   → publiée SANS être promue : seuls les tenants épinglés dessus la reçoivent"
  echo "     promouvoir plus tard (control plane) :"
  echo "     update code_module set default_version_id = '${VERSION_ID}'"
  echo "      where module_key = '${MODULE}';"
fi
