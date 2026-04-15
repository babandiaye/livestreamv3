# LiveStreamV2 — Plateforme Webinaire UN-CHK

Plateforme de webinaire institutionnelle basée sur LiveKit, Next.js 15, Prisma et Keycloak SSO. Intègre un plugin Moodle natif pour la gestion des sessions depuis le LMS.

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Frontend | Next.js 15, React 19, TypeScript |
| Temps réel | LiveKit (WebRTC) |
| Base de données | PostgreSQL 16 + Prisma 7 |
| Auth | Keycloak SSO via NextAuth |
| Stockage vidéo | MinIO (compatible S3) |
| LMS | Moodle 4.5+ + Plugin PHP mod_livestream |
| Serveur | Ubuntu 22/24, Node.js 20+, pnpm |
| Process manager | systemd |
| Orchestration | Docker Compose |

---

## Prérequis

### Système
- Ubuntu 22.04 ou 24.04
- Node.js >= 20
- pnpm >= 9
- Docker + Docker Compose
- Git

### Services requis (à déployer séparément)
- **LiveKit Server** — SFU WebRTC
- **LiveKit Egress** — enregistrement vidéo
- **LiveKit Ingress** — flux OBS/RTMP
- **Redis** — coordination LiveKit
- **PostgreSQL 16** — base de données
- **MinIO** — stockage S3 des enregistrements
- **Keycloak** — SSO institutionnel
- **Moodle 4.5+** — LMS

---

## Infrastructure Docker (LiveKit Stack)

Le fichier `compose.yaml` orchestre les services LiveKit :
```yaml
# /opt/livekit/compose.yaml
services:
  postgresql:   # PostgreSQL 16 — base de données
  redis:        # Redis 7 — coordination LiveKit
  livekit:      # LiveKit SFU — moteur WebRTC
  egress:       # LiveKit Egress — enregistrement + streaming
  ingress:      # LiveKit Ingress — flux OBS RTMP/WHIP
```

### Démarrer la stack LiveKit
```bash
cd /opt/livekit
docker compose up -d
docker compose ps
```

### Variables d'environnement PostgreSQL
```bash
# /opt/livekit/env.d/postgresql
POSTGRES_DB=<nom_base>
POSTGRES_USER=<utilisateur>
POSTGRES_PASSWORD=<mot_de_passe>
```

---

## Installation LiveStreamV2

### 1. Cloner le dépôt
```bash
git clone git@github.com:babandiaye/livestreamv2.git /var/www/html/livestreamv2
cd /var/www/html/livestreamv2
git checkout main
```

### 2. Installer les dépendances
```bash
pnpm install
```

### 3. Configurer les variables d'environnement
```bash
cp .env.example .env
nano .env
```

### 4. Initialiser la base de données
```bash
pnpm prisma migrate deploy
pnpm prisma generate
```

### 5. Builder l'application
```bash
pnpm build
```

### 6. Configurer le service systemd
```bash
nano /etc/systemd/system/livestream.service
```
```ini
[Unit]
Description=LiveKit Livestream Frontend
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/var/www/html/livestreamv2
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5
Environment="NODE_ENV=production"
LimitNOFILE=50000
StandardOutput=append:/var/log/livestream_outpout.log
StandardError=append:/var/log/livestream_error.log

[Install]
WantedBy=multi-user.target
```
```bash
systemctl daemon-reload
systemctl enable livestream
systemctl start livestream
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

> **Note** : `NEXT_PUBLIC_LIVEKIT_URL` est requis pour la page `/egress-layout` (enregistrement composite).
> La clé `MOODLE_API_KEY` ne doit pas contenir de caractères spéciaux (`#`, `$`, `!`, etc.).

---

## Commandes de déploiement

### Déployer une mise à jour
```bash
cd /var/www/html/livestreamv2
git pull origin main
pnpm install
pnpm prisma migrate deploy
pnpm build
service livestream restart
```

### Vérifier les logs
```bash
tail -f /var/log/livestream_outpout.log
tail -f /var/log/livestream_error.log
systemctl status livestream
docker logs livekit_egress -f
```

### Gérer le service
```bash
service livestream restart
service livestream stop
service livestream start
```

### Gérer la stack Docker LiveKit
```bash
cd /opt/livekit
docker compose up -d
docker compose down
docker compose restart egress
docker compose logs egress -f
docker compose ps
```

### Commandes base de données utiles
```bash
# Accéder à PostgreSQL
docker exec -it livekit_postgresql psql -U <user> -d <database> -h 127.0.0.1

# Lister les sessions
docker exec livekit_postgresql psql -U <user> -d <database> -h 127.0.0.1 \
  -c "SELECT id, \"roomName\", status, \"createdAt\" FROM \"Session\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# Lister les enregistrements avec statut
docker exec livekit_postgresql psql -U <user> -d <database> -h 127.0.0.1 \
  -c "SELECT filename, status, \"startedAt\", \"createdAt\" FROM \"Recording\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# Forcer le statut ENDED d'une session
docker exec livekit_postgresql psql -U <user> -d <database> -h 127.0.0.1 \
  -c "UPDATE \"Session\" SET status = 'ENDED', \"endedAt\" = NOW() WHERE \"roomName\" = '<room-name>';"

# Corriger les anciens enregistrements PROCESSING sans fichier réel
docker exec livekit_postgresql psql -U <user> -d <database> -h 127.0.0.1 \
  -c "UPDATE \"Recording\" SET status = 'READY' WHERE status = 'PROCESSING' AND filename != 'Enregistrement en cours…';"
```

### Prisma (migrations)
```bash
pnpm prisma migrate deploy
pnpm prisma migrate status
pnpm prisma generate
```

---

## Plugin Moodle (mod_livestream)

### Installation
```bash
cp -r mod_livestream /var/www/html/<moodle>/mod/livestream/
chown -R www-data:www-data /var/www/html/<moodle>/mod/livestream/
```

Puis **Administration Moodle → Notifications** pour finaliser.

### Configuration admin Moodle

| Paramètre | Valeur |
|-----------|--------|
| URL LiveStream | `https://<votre-domaine>` |
| Clé API | `<MOODLE_API_KEY>` |
| Timeout | `30` secondes |
| Enrôlement auto | Activé |

### API Moodle disponibles

Toutes les routes nécessitent le header `X-Api-Key: <MOODLE_API_KEY>`.

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

## Enregistrement composite (Egress layout custom)

Depuis la v4.3.0, l'enregistrement capture en une seule vidéo MP4 :
- **Partage d'écran** au centre (contenu principal)
- **Caméra animateur** en PiP bas droite
- **Chat en direct** dans un panneau latéral
- **Tableau blanc** synchronisé via data channels LiveKit
- **Audio** de tous les participants sur scène

Le flux technique :
```
Bouton "Enregistrer" → start_recording API
  → startWebEgress(url=/egress-layout?roomName=xxx)
  → Egress Chrome charge la page
  → /api/egress-token génère un token viewer caché
  → La page se connecte à la room LiveKit
  → Demande l'historique du tableau blanc (__wb_request_init__)
  → Enregistrement MP4 1080p 60fps → MinIO S3
```

Statuts de l'enregistrement :
| Statut | Description |
|--------|-------------|
| `PROCESSING` | Enregistrement en cours — badge ⏳ jaune |
| `READY` | Fichier disponible — boutons Voir/Télécharger actifs |
| `FAILED` | Échec Egress — badge ✗ rouge |

---

## Architecture
```
┌─────────────────────────────────────────────────────┐
│                    Moodle (LMS)                     │
│              mod_livestream (PHP)                   │
└────────────────────┬────────────────────────────────┘
                     │ API REST (X-Api-Key)
┌────────────────────▼────────────────────────────────┐
│           LiveStreamV2 (Next.js 15)                 │
│  /host  /watch  /admin  /moderator  /student        │
│  /egress-layout  (composite recording page)         │
│              API Routes Next.js                     │
└──────┬──────────────┬──────────────┬────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌────▼────────┐
│  LiveKit    │ │PostgreSQL │ │   MinIO S3  │
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

## Rôles utilisateurs

| Rôle | Redirection | Accès |
|------|-------------|-------|
| `ADMIN` | `/admin` | Gestion complète — salles, utilisateurs, enregistrements |
| `MODERATOR` | `/moderator` | Ses salles, enrôlement CSV/individuel, enregistrements |
| `VIEWER` | `/student` | Sessions auxquelles il est enrôlé |

---

## Enrôlement CSV

Format accepté :
```csv
email,prenom,nom
etudiant@domaine.sn,Prénom,Nom
```

- Séparateur `,` ou `;`
- Colonne `email` obligatoire, `prenom` et `nom` optionnels
- Utilisateurs inexistants créés automatiquement
- Batch de 500 — supporte jusqu'à 10 000 utilisateurs
- Pagination par lot de 50 dans les interfaces

---

## Versions

| Version | Description |
|---------|-------------|
| v1.0.0 | MVP — LiveKit + auth Keycloak |
| v2.0.0 | Enrôlement, enregistrements S3, dashboard admin |
| v3.0.0 | Plugin Moodle + fix Egress + CSV + statut session + kick |
| v4.0.0 | Redesign sidebar UN-CHK + pagination 50 |
| v4.1.0 | Page /watch redesign + logo + responsive mobile |
| v4.2.0 | Statut enregistrement PROCESSING/READY/FAILED |
| v4.3.0 | Egress layout custom cam+chat+écran + webhook web egress |
| v4.4.0 | Tableau blanc collaboratif canvas HTML5 + egress sync |
| v4.5.0 | Tableau blanc intégré zone principale host/watch/egress + qualité enregistrement 1080p 60fps 4.5Mbps |

---

## Équipe

**DITSI — Université Numérique Cheikh Hamidou Kane (UN-CHK)**
© 2026 — Tous droits réservés
