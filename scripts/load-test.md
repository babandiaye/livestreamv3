# Test de charge LiveKit — validation des chantiers 1 & 2

But : chiffrer le gain des optimisations réseau (adaptiveStream + dynacast +
plafonds de publication, chantiers 1-2) **avant tout déploiement en production**,
en reproduisant les conditions de l'incident du **16/07/2026** (932 participants,
lien 1 GbE saturé ~1,25 Gbps sortant, 18,6 % de perte de paquets).

Réf. doc officielle : https://docs.livekit.io/transport/self-hosting/benchmark/

> ⚠️ À exécuter **uniquement sur la préprod** (`wss://preprod-webinairertc.unchk.sn`),
> jamais sur la prod. Le test génère un trafic massif volontaire.

---

## 1. Outil : `lk load-test`

La CLI officielle LiveKit embarque un simulateur de charge. Installation :

```bash
# https://docs.livekit.io/home/cli/cli-setup/
curl -sSL https://get.livekit.io/cli | bash
lk --version
```

Authentification — utiliser les clés de la **préprod** (jamais commiter ces valeurs) :

```bash
export LIVEKIT_URL="wss://preprod-webinairertc.unchk.sn"
export LIVEKIT_API_KEY="<clé_préprod>"
export LIVEKIT_API_SECRET="<secret_préprod>"
```

---

## 2. Topologie simulée

Elle reproduit notre cas réel : **1 animateur publie** (caméra 720p, comme
`publisherRoomOptions`), **N spectateurs s'abonnent** sans publier (comme
`viewerRoomOptions`). C'est la charge de distribution descendante qui saturait
le lien — donc le point que les chantiers 1-2 doivent soulager.

```bash
# 1 publisher vidéo 720p + N subscribers, salle dédiée au test
lk load-test \
  --room charge-preprod \
  --video-publishers 1 \
  --subscribers <N> \
  --video-resolution high \
  --duration 2m
```

> Le simulateur crée ses propres participants ; il n'a pas besoin de l'appli
> Next.js. adaptiveStream/dynacast agissent côté SFU dès que les abonnés
> simulés demandent des couches — le gain est donc mesurable directement.

---

## 3. Montée en charge progressive

Trois paliers, un run de 2 min chacun, en notant les métriques (§4) à chaud :

| Palier | `--subscribers` | Objectif |
|--------|-----------------|----------|
| 1      | 100             | référence basse, tout doit être vert |
| 2      | 500             | zone intermédiaire |
| 3      | 900             | proche du volume de l'incident (932) |

```bash
for N in 100 500 900; do
  echo "=== Palier $N abonnés ==="
  lk load-test --room charge-preprod --video-publishers 1 \
    --subscribers "$N" --video-resolution high --duration 2m
  sleep 30   # laisser le nœud revenir au repos entre les paliers
done
```

---

## 4. Métriques à relever (avant / après chantiers 1-2)

Reprendre **exactement** les mêmes indicateurs que le rapport Grafana du 16/07,
pour une comparaison directe :

| Métrique | Où la lire | Seuil d'alerte |
|----------|-----------|----------------|
| Débit sortant NIC du nœud SFU | Grafana (node_network_transmit_bytes) / `ifstat` | approche 1 Gbps = saturation |
| Perte de paquets | Grafana LiveKit / stats de sortie `lk load-test` | > 1 % = dégradation perçue |
| CPU du nœud SFU | Grafana (node CPU) / `docker stats livekit_sfu` | soutenu > 80 % |
| Couches servies | `docker logs livekit_sfu` + chrome://webrtc-internals | doit descendre à h180/h360 sous charge |

Commandes de relevé rapides pendant un run :

```bash
# Débit réseau (interface principale du nœud SFU)
ifstat -i eth0 1

# CPU / mémoire des conteneurs LiveKit
docker stats --no-stream livekit_sfu livekit_egress
```

---

## 5. Critère de validation

Les chantiers 1-2 sont validés si, **au palier 900**, on observe par rapport à
un run témoin **sans** les options (branche avant chantier 1) :

- une baisse nette du débit sortant NIC (les abonnés simulés en basse résolution
  ne tirent plus la couche 720p grâce à dynacast + adaptiveStream) ;
- une perte de paquets ramenée sous 1 % ;
- un CPU nœud stabilisé.

Tant que ce critère n'est pas atteint et documenté, **ne pas déployer 1-2 en
production**.

---

## 6. Nettoyage

```bash
# Fermer la salle de test si elle persiste
lk room delete charge-preprod
```
