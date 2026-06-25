# LiveStreamV3 — Plateforme Webinaire UN-CHK

Plateforme de webinaire institutionnelle basée sur **LiveKit**, **Next.js 15**, **Prisma 7** et **Keycloak SSO**. Intègre un plugin Moodle natif pour la gestion des sessions depuis le LMS.

> **v3** est une refonte architecturale de v2 : architecture modulaire (composants UI réutilisables, services métier, types centralisés), landing page publique, middleware sécurisé et nouvelle route S3 signée pour les enregistrements.

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | Next.js 15.1, React 19, TypeScript 5.7 |
| Temps réel | LiveKit 2.9 (WebRTC) + Egress + Ingress |
| Base de données | PostgreSQL 16 + Prisma 7.5 |
| Auth | Keycloak SSO via NextAuth 5 |
| Stockage vidéo | MinIO (S3-compatible) |
| LMS | Moodle 4.5+ + plugin `mod_livestream` |
| UI | Radix UI + TailwindCSS 3.4 |
| Tableau blanc | Excalidraw |
| Serveur | Ubuntu 22/24, Node.js 20+, pnpm 9+ |
| Process manager | systemd |
| Orchestration | Docker Compose |

---

## Prérequis

### Système
- Ubuntu 22.04 ou 24.04
- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker + Docker Compose
- Git

### Services requis
- **LiveKit Server** — SFU WebRTC
- **LiveKit Egress** — enregistrement composite
- **LiveKit Ingress** — flux OBS/RTMP
- **Redis** — coordination LiveKit
- **PostgreSQL 16** — base de données
- **MinIO** — stockage S3 des enregistrements
- **Keycloak** — SSO institutionnel
- **Moodle 4.5+** — LMS (optionnel)

---

## Infrastructure Docker (stack LiveKit)

Le fichier `/opt/livekit/compose.yaml` orchestre les services LiveKit :
```yaml
services:
  postgresql:   # PostgreSQL 16
  redis:        # Redis 7 — coordination LiveKit
  livekit:      # LiveKit SFU
  egress:       # LiveKit Egress — enregistrement (shm_size: 1gb requis, cf. plus bas)
  ingress:      # LiveKit Ingress — OBS RTMP/WHIP
```

> ⚠️ Le service `egress` **doit** déclarer `shm_size: 1gb` (sinon Chrome crashe en
> enregistrement). Voir « Fiabilité de l'enregistrement (egress) » plus bas.

### Démarrer la stack
```bash
cd /opt/livekit
docker compose up -d
docker compose ps
```

### Variables PostgreSQL
```bash
# /opt/livekit/env.d/postgresql
POSTGRES_DB=<nom_base>
POSTGRES_USER=<utilisateur>
POSTGRES_PASSWORD=<mot_de_passe>
```

---

## Déploiement LiveStreamV3

### 1. Cloner le dépôt
```bash
git clone git@github.com:<org>/livestreamv3.git /var/www/html/livestreamv3
cd /var/www/html/livestreamv3
git checkout main
```

### 2. Installer les dépendances
```bash
pnpm install
```

### 3. Configurer les variables d'environnement
```bash
cp env.example .env
nano .env
```
Voir la section [Variables d'environnement](#variables-denvironnement-env).

### 4. Initialiser la base de données
```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

### 5. Builder l'application
```bash
pnpm build
```

### 6. Configurer le service systemd
```bash
sudo nano /etc/systemd/system/livestream.service
```
```ini
[Unit]
Description=LiveKit Livestream Frontend
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/var/www/html/livestreamv3
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5
Environment="NODE_ENV=production"
LimitNOFILE=50000
StandardOutput=append:/var/log/livestream_output.log
StandardError=append:/var/log/livestream_error.log

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable livestream
sudo systemctl start livestream
sudo systemctl status livestream
```

L'application écoute sur le port **4000** (défini dans `package.json` → `next start -p 4000`).

### 7. (Optionnel) Reverse proxy Nginx
```nginx
server {
  listen 443 ssl http2;
  server_name <votre-domaine>;
  ssl_certificate     /etc/letsencrypt/live/<domaine>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<domaine>/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 100M;
  }
}
```

---

## Variables d'environnement (.env)

```env
# ── Application ──────────────────────────────────────
NEXT_PUBLIC_SITE_URL=https://<votre-domaine>
AUTH_URL=https://<votre-domaine>
AUTH_TRUST_HOST=true

# ── LiveKit ──────────────────────────────────────────
LIVEKIT_WS_URL=wss://<livekit-domain>
NEXT_PUBLIC_LIVEKIT_URL=wss://<livekit-domain>
LIVEKIT_API_KEY=<votre-api-key>
LIVEKIT_API_SECRET=<votre-api-secret>

# ── MinIO S3 ─────────────────────────────────────────
S3_ACCESS_KEY=<access-key>
S3_SECRET=<secret-key>
S3_ENDPOINT=http://<minio-host>:<port>
S3_REGION=us-east-1
S3_BUCKET=<nom-du-bucket>

# ── Keycloak SSO ─────────────────────────────────────
KEYCLOAK_ENABLED=true
KEYCLOAK_AUTO_REDIRECT=true
NEXT_PUBLIC_KEYCLOAK_ENABLED=true
KEYCLOAK_CLIENT_ID=<client-id>
KEYCLOAK_CLIENT_SECRET=<client-secret>
KEYCLOAK_ISSUER=https://<keycloak-host>/realms/<realm>

# ── NextAuth ─────────────────────────────────────────
AUTH_SECRET=<secret-32-chars-minimum>

# ── PostgreSQL ───────────────────────────────────────
DATABASE_URL="postgresql://<user>:<password>@127.0.0.1:5432/<database>"

# ── Plugin Moodle ────────────────────────────────────
MOODLE_API_KEY=<cle-api-sans-caracteres-speciaux>

# ── Divers ───────────────────────────────────────────
WATCH_PUBLIC=true
```

> **Notes**
> - `NEXT_PUBLIC_LIVEKIT_URL` est requis pour `/egress-layout` (enregistrement composite).
> - `MOODLE_API_KEY` ne doit pas contenir de caractères spéciaux (`#`, `$`, `!`, etc.).
> - `WATCH_PUBLIC=true` autorise l'accès anonyme à `/watch/[roomName]`.
> - Si `KEYCLOAK_ENABLED=false`, l'app bascule sur un provider Credentials local.

---

## Structure du projet (v3)

```
src/
├── app/
│   ├── home.client.tsx         # Landing page publique (v3)
│   ├── admin/                  # Dashboard administrateur
│   ├── moderator/              # Dashboard modérateur
│   ├── student/                # Dashboard étudiant
│   ├── host/                   # Interface animateur (stream)
│   ├── watch/[roomName]/       # Page spectateur
│   ├── egress-layout/          # Layout composite pour l'enregistrement
│   └── api/                    # Routes API (38 endpoints)
├── components/
│   ├── layout/                 # Sidebar, Footer
│   └── ui/                     # Avatar, Badge, Pagination, RecordingList, EnrollPanel
├── lib/
│   ├── services/               # enrollment / recording / session
│   ├── controller.ts           # Orchestration LiveKit
│   └── prisma.ts
├── types/index.ts              # Types centralisés + utilitaires (formatDuration, formatSize)
├── auth.ts                     # NextAuth config (Keycloak + Credentials)
└── middleware.ts               # Gardien des routes
```

---

## Modèle de branches (Git)

Le dépôt suit un flux à **trois branches** maintenues identiques une fois une version validée :

| Branche | Rôle |
|---------|------|
| `dev`  | Branche de **travail** — tous les commits/correctifs y arrivent d'abord |
| `main` | Branche **stable** (intégration validée) |
| `prod` | Branche **déployée en production** — référence de ce qui doit tourner en prod |

Cycle : on développe et on teste sur `dev` ; quand tout est validé, on **fast-forward** `dev` vers `main` et `prod` :

```bash
git push origin dev                                  # 1. travail sauvegardé sur dev
git branch -f main dev && git push origin main       # 2. main = dev
git branch -f prod dev && git push origin prod       # 3. prod = dev
```

> `main` et `prod` doivent **toujours pointer sur le même commit** une fois la synchro faite.
> Il peut arriver que `prod` soit **en retard** sur `dev` (travail en cours non encore validé) : c'est normal, on ne déploie en production que ce qui est sur `prod`.

---

## Déployer une mise à jour (production)

> ⚠️ On déploie **la branche `prod`** sur le serveur de production. **Toujours sauvegarder la base** avant (voir section suivante), surtout si des migrations sont en attente.

```bash
cd /var/www/html/livestreamv3

# 1. Récupérer la version de production
git fetch origin
git checkout prod
git reset --hard origin/prod        # aligne exactement le code local sur origin/prod

# 2. Dépendances (si package.json a changé)
pnpm install

# 3. Migrations de base de données (voir section dédiée ci-dessous)
pnpm prisma migrate status          # liste les migrations en attente
pnpm prisma migrate deploy          # applique SANS perte de données

# 4. Build + redémarrage
pnpm build
sudo systemctl restart livestream
sudo systemctl status livestream --no-pager
```

> **Prérequis `.env`** : `DATABASE_URL` **doit** être défini en production. Depuis la v1.1 il n'y a **plus de chaîne de connexion par défaut codée en dur** — si `DATABASE_URL` est absent, l'application **refuse de démarrer** (erreur explicite). Vérifier aussi `AUTH_SECRET`, les clés `LIVEKIT_*`, `S3_*`, `KEYCLOAK_*`.

---

## Migration de la base de données sans perte de données

La plateforme utilise les **migrations Prisma** (`prisma/migrations/`). En production on applique **uniquement** `migrate deploy`, qui exécute les migrations en attente de façon **additive et non destructive** — il ne réinitialise jamais la base.

### Procédure sûre

```bash
# 1. SAUVEGARDE COMPLÈTE de la base (impératif avant toute migration)
mkdir -p /root/backups
sudo docker exec livekit_postgresql pg_dump -U <user> -d <database> \
  > /root/backups/livestream_$(date +%F_%H%M).sql

# 2. Voir ce qui sera appliqué (lecture seule, aucune écriture)
pnpm prisma migrate status

# 3. Appliquer les migrations en attente (non destructif, conserve les données)
pnpm prisma migrate deploy

# 4. Régénérer le client Prisma, rebuild, redémarrer
pnpm prisma generate
pnpm build
sudo systemctl restart livestream
```

### Règles d'or

- ✅ **Toujours** `prisma migrate deploy` en production (applique les migrations validées, **conserve les données**).
- ❌ **Jamais** `prisma migrate reset` ni `prisma migrate dev` en production → ils **suppriment/recréent** des tables (perte de données).
- ✅ **Toujours** un `pg_dump` **avant** d'appliquer une migration.
- ⚠️ Les nouvelles migrations se **créent et se testent sur `dev`** (`pnpm prisma migrate dev --name <nom>`), se commitent dans `prisma/migrations/`, puis remontent via `dev → main → prod`. **Ne jamais** créer une migration directement en production.
- ⚠️ Changement **destructif** (suppression de colonne/table) : utiliser le motif **expand → contract** : (1) déployer d'abord le code qui n'utilise plus la colonne, (2) **ensuite** déployer la migration qui la supprime — pour éviter toute perte/incident pendant la transition.

> Note : une montée de version qui **ne modifie pas le schéma** (ex. correctifs de code uniquement) n'a **aucune migration en attente** → `migrate deploy` est alors sans effet et il n'y a aucun risque pour les données.

### Restauration (rollback)

```bash
# Restaurer la sauvegarde prise à l'étape 1
cat /root/backups/livestream_<date>.sql | \
  sudo docker exec -i livekit_postgresql psql -U <user> -d <database>
# revenir au commit précédent côté code
git reset --hard <commit-précédent> && pnpm build && sudo systemctl restart livestream
```

---

## Commandes utiles

### Logs & service
```bash
sudo systemctl status livestream
sudo systemctl restart livestream
tail -f /var/log/livestream_output.log
tail -f /var/log/livestream_error.log
sudo docker logs livekit_egress -f
```

### Stack Docker LiveKit
```bash
cd /opt/livekit
sudo docker compose up -d
sudo docker compose restart egress
sudo docker compose logs egress -f
sudo docker compose ps
```

### Base de données
```bash
# Accès interactif PostgreSQL
sudo docker exec -it livekit_postgresql psql -U <user> -d <database>

# Lister les sessions
sudo docker exec livekit_postgresql psql -U <user> -d <database> \
  -c "SELECT id, \"roomName\", status, \"createdAt\" FROM \"Session\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# Lister les enregistrements
sudo docker exec livekit_postgresql psql -U <user> -d <database> \
  -c "SELECT filename, status, \"createdAt\" FROM \"Recording\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# Forcer le statut ENDED d'une session
sudo docker exec livekit_postgresql psql -U <user> -d <database> \
  -c "UPDATE \"Session\" SET status = 'ENDED', \"endedAt\" = NOW() WHERE \"roomName\" = '<room-name>';"

# Activer chat + participation sur toutes les salles
sudo docker exec livekit_postgresql psql -U <user> -d <database> \
  -c "UPDATE \"Session\" SET \"chatEnabled\" = true, \"participationEnabled\" = true;"
```

### Prisma
```bash
pnpm prisma migrate deploy       # Applique les migrations en prod
pnpm prisma migrate status       # État des migrations
pnpm prisma generate             # Régénère le client Prisma
pnpm prisma studio               # Interface graphique (dev)
```

---

## Plugin Moodle (mod_livestream)

### Installation
```bash
cp -r mod_livestream /var/www/html/<moodle>/mod/livestream/
sudo chown -R www-data:www-data /var/www/html/<moodle>/mod/livestream/
```
Puis **Administration Moodle → Notifications** pour finaliser l'installation.

### Configuration
| Paramètre | Valeur |
|-----------|--------|
| URL LiveStream | `https://<votre-domaine>` |
| Clé API | `<MOODLE_API_KEY>` |
| Timeout | `30` secondes |
| Enrôlement auto | Activé |

### API Moodle
Toutes les routes exigent le header `X-Api-Key: <MOODLE_API_KEY>`.

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/moodle/rooms` | Créer ou récupérer une salle |
| GET | `/api/moodle/rooms/[id]/status` | Statut de la salle |
| GET | `/api/moodle/rooms/[id]/recordings` | Liste des enregistrements |
| POST | `/api/moodle/join` | Rejoindre en tant qu'étudiant |
| POST | `/api/moodle/start` | Démarrer en tant que modérateur |
| POST | `/api/moodle/enroll` | Enrôlement masse depuis Moodle |
| DELETE | `/api/moodle/recordings/[id]` | Supprimer un enregistrement |

---

## Rôles utilisateurs

| Rôle | Redirection | Accès |
|------|-------------|-------|
| `ADMIN` | `/admin` | Gestion complète — salles, utilisateurs, enregistrements, statut services |
| `MODERATOR` | `/moderator` | Ses salles, enrôlement CSV/individuel, ses enregistrements |
| `VIEWER` | `/student` | Sessions auxquelles il est enrôlé |

---

## Enrôlement CSV

Format :
```csv
email,prenom,nom
etudiant@domaine.sn,Prénom,Nom
```
- Séparateur `,` ou `;`
- Colonne `email` obligatoire
- Utilisateurs inexistants créés automatiquement
- Batch de 500 — jusqu'à 10 000 utilisateurs
- Pagination 20 par lot dans l'interface

---

## Enregistrement composite (Egress layout)

L'enregistrement capture en un seul MP4 :
- Partage d'écran (contenu principal)
- Caméra animateur (PiP bas droite)
- Chat en direct (panneau latéral)
- Tableau blanc synchronisé (data channels LiveKit)
- Audio de tous les participants sur scène

Flux technique :
```
Bouton "Enregistrer" → /api/start_recording
  → startWebEgress(url=/egress-layout?roomName=xxx)
  → Egress Chrome charge la page
  → /api/egress-token génère un token viewer caché
  → Enregistrement MP4 1080p 30fps → MinIO S3
  → Webhook met à jour le statut en base
```

| Statut | Description |
|--------|-------------|
| `PROCESSING` | En cours — badge jaune |
| `READY` | Disponible — Voir/Télécharger |
| `FAILED` | Échec Egress — badge rouge |

### ⚙️ Fiabilité de l'enregistrement (egress) — IMPORTANT

Le **web egress** repose sur un Chrome headless et **n'est pas lié au cycle de vie de
la salle**. Plusieurs garde-fous sont en place ; un réglage d'infra est **obligatoire**.

**1. `/dev/shm` du conteneur egress = 1 Go (OBLIGATOIRE).**
Le `/dev/shm` par défaut de Docker (64 Mo) est trop petit pour le Chrome de l'egress :
sous charge réelle (plusieurs caméras + partage d'écran), Chrome **crashe en cours de
capture** → enregistrement `FAILED` ou tronqué. À régler dans `/opt/livekit/compose.yaml` :
```yaml
egress:
  image: livekit/egress:latest
  shm_size: 1gb        # ← indispensable
```
Puis recréer le conteneur :
```bash
cd /opt/livekit
docker compose up -d egress
# Vérifier (doit renvoyer 1073741824) :
docker inspect livekit_egress --format '{{.HostConfig.ShmSize}}'
```

**2. Enregistrement vs diffusion RTMP.**
Le webhook ne crée une ligne `Recording` que pour les egress de **type fichier**
(`isRecordingEgress`). Les diffusions RTMP (`room_composite`/stream) ne génèrent plus
de faux enregistrement `FAILED`.

**3. Arrêt automatique (anti-fuite).**
Si l'animateur ferme l'onglet / perd le réseau sans cliquer sur « Stop », l'egress
serait sinon resté actif indéfiniment. Deux filets :
- côté serveur : le webhook `room_finished` arrête tout egress encore actif de la salle
  (retrouvé via la base) — déclenché après `empty_timeout` (300 s, cf. `livekit-server.yaml`) ;
- côté client : un handler `pagehide` envoie un `stop` *best-effort* (`fetch keepalive`).

**4. Réconciliation des `PROCESSING` bloqués.**
Si un webhook `egress_ended` est manqué, une ligne peut rester `PROCESSING`. Elle est
réconciliée automatiquement avec l'état réel de LiveKit (`listEgress`) :
- à l'affichage des listes (`/api/recordings/me`, `/api/admin/recordings`),
- lors du polling de statut (`/api/recording-status`, après 60 s).

**5. Dépendance Redis / worker egress.**
L'egress dépend de **Redis** et d'un worker disponible. S'ils sont indisponibles,
`/api/start_recording` et `/api/start-streaming` renvoient **503** avec un message clair
(au lieu d'une 500 opaque). Vérifier la stack :
```bash
docker compose -f /opt/livekit/compose.yaml ps        # redis/egress doivent être healthy
docker logs livekit_egress --tail 50
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Moodle (LMS)                     │
│              mod_livestream (PHP)                   │
└────────────────────┬────────────────────────────────┘
                     │ API REST (X-Api-Key)
┌────────────────────▼────────────────────────────────┐
│           LiveStreamV3 (Next.js 15)                 │
│  /  /admin  /moderator  /student  /host  /watch     │
│  /egress-layout  (composite recording)              │
│              API Routes (38 endpoints)              │
└──────┬──────────────┬──────────────┬────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐
│  LiveKit    │ │PostgreSQL │ │  MinIO S3  │
│  (WebRTC)   │ │ (Prisma)  │ │(Enreg. MP4)│
│  + Egress   │ └───────────┘ └────────────┘
└──────┬──────┘
       │
┌──────▼──────┐
│   Keycloak  │
│    (SSO)    │
└─────────────┘
```

---

## Versions

| Version | Description |
|---------|-------------|
| **v1-refonte** | Refonte architecturale de la plateforme : composants UI réutilisables, services métier, types centralisés, landing page publique, middleware sécurisé, URL S3 signées pour les enregistrements, sidebar avec icônes SVG |
| **v1.1** | Sécurité : vérification de signature des tokens LiveKit, contrôle « créateur » sur les actions animateur (kick / enregistrement / diffusion / OBS), `create_stream` réservé aux animateurs, auto-provision des étudiants Moodle. UX : notification compacte des demandes de prise de parole + acceptation depuis la liste des participants. Diffusion **OBS (RTMP/WHIP)** réactivée depuis la page animateur. Retrait des identifiants de base codés en dur (`DATABASE_URL` requis). Flux Git **dev / main / prod**. |

---

## Équipe

**DITSI — Université Numérique Cheikh Hamidou Kane (UN-CHK)**
© 2026 — Tous droits réservés
