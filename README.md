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
  egress:       # LiveKit Egress — enregistrement
  ingress:      # LiveKit Ingress — OBS RTMP/WHIP
```

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

## Déployer une mise à jour

```bash
cd /var/www/html/livestreamv3
git pull origin main
pnpm install
pnpm prisma migrate deploy
pnpm build
sudo systemctl restart livestream
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
  → Enregistrement MP4 1080p 60fps → MinIO S3
  → Webhook met à jour le statut en base
```

| Statut | Description |
|--------|-------------|
| `PROCESSING` | En cours — badge jaune |
| `READY` | Disponible — Voir/Télécharger |
| `FAILED` | Échec Egress — badge rouge |

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

---

## Équipe

**DITSI — Université Numérique Cheikh Hamidou Kane (UN-CHK)**
© 2026 — Tous droits réservés
