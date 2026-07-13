# One Data — Publication des modules (tags + script)

Objectif : **zéro SQL manuel, zéro galère de cache**. Une commande publie une
version de module. Les tags sont immuables (comme un SHA, mais lisibles).

## Installation (une seule fois)

1. **Cloner le repo des modules en local** (GitHub Desktop) :
   `oropra/one-data-modules` → clone sur ta machine.
2. Y déposer `publish.sh`, `refresh.sh`, `.env.example`, `.gitignore`.
3. Copier `.env.example` en **`.env`** et y coller la **service_role du control
   plane** (Supabase control plane → Project Settings → API → `service_role`).
   ⚠ `.env` est gitignoré : **ne jamais le committer**.
4. Appliquer **une fois** `publish_rpc.sql` sur le control plane (SQL editor).

## Publier une version (le geste courant)

Tu as un nouveau `annuaire.js` ? Dépose-le dans le dossier du repo, puis :

```bash
./publish.sh annuaire v3
```

Ce que ça fait, tout seul :
- commit + push de `annuaire.js`
- crée le tag immuable `annuaire-v3` et le pousse
- pointe le registre sur `…@annuaire-v3/annuaire.js` (version par défaut)

→ **tous les clients** sur la version par défaut d'`annuaire` reçoivent la v3.
Pas de SQL, pas de purge, pas de cache.

Règle : **un vrai changement = une nouvelle version** (v3 → v4). On ne réutilise
jamais un tag (c'est ce qui garantit l'immuabilité et l'absence de cache).

## Livrer à UN seul client (personnalisation)

La publication ci-dessus met à jour la version **par défaut** (tous). Pour ne
cibler qu'un client, on ne touche pas au défaut : on ajoute une ligne dans
`tenant_module` (version spécifique pour ce tenant). Script dédié à venir si
besoin ; d'ici là c'est un insert ponctuel.

## Itérer vite pendant la mise au point (optionnel)

Quand on débogue un module (plusieurs commits d'affilée), tagger à chaque fois
est lourd. Alternative : pointer **temporairement** le registre de ce module sur
`@main` (un update une fois), puis :

```bash
./refresh.sh annuaire      # commit + push + purge @main
```

Recharge l'app. Quand le module est stable → `./publish.sh annuaire vX` pour le
figer sur un tag (et sortir de @main).

## Rollback

Revenir à une version précédente = republier son tag comme défaut :
```bash
# via l'API (ou un petit update) : pointer la version par défaut sur annuaire-v2
```
Comme chaque version est un tag immuable, aucun rollback ne casse le cache.
