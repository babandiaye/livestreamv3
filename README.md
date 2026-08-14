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

### ⚠️ ICE : ne jamais déclarer `turn_servers` sans `stun_servers`

Dans `/opt/livekit/livekit-server.yaml`, déclarer `rtc.turn_servers` **remplace** les serveurs STUN par défaut dans la liste `iceServers` envoyée aux clients. Sans STUN, le navigateur ne découvre pas son IP publique → **aucun candidat `srflx`** → le seul chemin possible devient le **relais TURN en TLS/TCP**, et toute la visioconférence se dégrade (caméra reçue en `frameHeight=180`, image floue).

Le symptôme se présente comme un problème d'encodage, mais **aucun réglage de bitrate ne le corrige** : sur un chemin relayé en TCP, remonter le débit ne fait qu'échanger du flou contre du gel.

Configuration correcte — STUN **et** TURN, avec l'UDP proposé avant le TLS :

```yaml
rtc:
  udp_port: 7882
  tcp_port: 7881
  node_ip: <IP_PUBLIQUE_DU_SFU>
  use_external_ip: false
  stun_servers:
    - webinaire-turn.unchk.sn:3478
    - webinaire-turn.unchk.sn:443
  turn_servers:
    - host: webinaire-turn.unchk.sn   # UDP d'abord : évite le blocage de tête
      port: 443                        # de ligne et les retransmissions du TCP
      protocol: udp
      username: <user>
      credential: <secret>
    - host: webinaire-turn.unchk.sn   # TLS/TCP en dernier recours
      port: 443
      protocol: tls
      username: <user>
      credential: <secret>
```

> Les STUN publics Google sont **bloqués par le réseau UN-CHK** : utiliser notre coturn (`webinaire-turn.unchk.sn`), qui sert STUN **et** TURN. Vérifié : il répond en UDP sur **3478 et 443** et accepte les allocations TURN sur les deux (`no-tcp` est actif → seul le TLS/443 fonctionne en TCP).

**Diagnostic** — capturer sur le SFU : `tcpdump -n -i <iface> "udp port 7882"`. Si 100 % du trafic provient de l'IP du serveur TURN et 0 % des IP clientes, aucun client ne tente l'UDP direct → suspecter la liste `iceServers`, pas l'encodeur. Côté navigateur, `chrome://webrtc-internals` : chercher un candidat `srflx` et le `relayProtocol` de la paire retenue.

> ⚠️ Ce fichier **n'est pas versionné** : la correction doit être appliquée **manuellement sur chaque environnement** (préprod et prod).

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

# ── SMTP (e-mails, optionnel) ────────────────────────
SMTP_HOST=smtp.unchk.edu.sn      # absent = envoi ignoré (aucune erreur)
SMTP_PORT=587                    # 587 STARTTLS / 465 SSL / 25
SMTP_SECURE=false                # true pour le port 465
SMTP_USER=
SMTP_PASS=
MAIL_FROM="UN-CHK Webinaire <no-reply@unchk.edu.sn>"

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
│   ├── watch/[roomName]/       # Page spectateur (contrôle « modérateur requis »)
│   ├── acces-refuse/           # Page publique : accès étudiant bloqué
│   ├── egress-layout/          # Layout composite pour l'enregistrement
│   └── api/                    # Routes API (41 endpoints)
├── components/
│   ├── layout/                 # Sidebar (tiroir mobile), Footer
│   └── ui/                     # Avatar, Badge, Pagination, RoomIcon, icons (Lucide),
│                               #   RecordingList, EnrollPanel, AttendancePanel
├── lib/
│   ├── services/               # enrollment / recording / session
│   ├── controller.ts           # Orchestration LiveKit (+ isModeratorPresent)
│   ├── attendance.ts           # Liste de présence (join/left/orphelins + agrégation)
│   ├── chat-transcript.ts      # Formatage pur de la transcription du chat
│   ├── livekit-options.ts      # RoomOptions centralisées (simulcast, dynacast)
│   ├── settings.ts             # Réglages globaux (AppSetting) + règle « étudiant »
│   ├── egress.ts               # Réconciliation des enregistrements
│   └── prisma.ts
├── types/index.ts              # Types centralisés + utilitaires (formatDuration, formatSize)
├── auth.ts                     # NextAuth config (Keycloak + Credentials)
└── middleware.ts               # Gardien des routes
```

---

## Liste de présence (émargement)

Chaque salle dispose d'un onglet **Présence** (côté admin et modérateur créateur/enrôlé) qui reconstitue l'émargement des sessions.

**Fonctionnement** — le SFU LiveKit envoie des webhooks à `/api/webhook/livekit` :

- `participant_joined` → une ligne `Attendance` est créée (**une ligne par connexion réelle**) ;
- `participant_left` → la connexion correspondante est refermée (calcul de la durée) ;
- `room_finished` → filet de sécurité : toutes les connexions restées ouvertes (webhook perdu, coupure) sont refermées avec l'heure de fin.

Les participants **système** (egress `egress-recorder-*`, ingress `… (via OBS)`) sont **exclus**. Une reconnexion crée une nouvelle ligne ; `lib/attendance.ts` **somme les durées** et compte les reconnexions. Le champ `sessionStartedAt` sépare deux réunions successives tenues dans la **même** salle réutilisée.

**Rattachement nominatif** — la référence de l'utilisateur (`userId`/`email`) est transportée dans la **metadata du token** de connexion (posée par `join_stream`, `moodle/join`, `create_stream`), puis résolue par le webhook :

- **Moodle** et **étudiant authentifié** → rattachés à leur compte (badge « Compte ») ;
- **animateur** → badge « Animateur » ;
- **invité `/watch`** (sans authentification) → badge « Invité » (non vérifié).

**Restitution** — sessions groupées et repliables (label `salle-timestamp`, bouton **Détail/œil**), avec temps total, heures d'arrivée/départ, nombre de reconnexions, **pagination** (sessions et participants) et **export CSV**.

**Suppression** — une corbeille permet d'effacer soit **une séance entière**, soit **un participant** d'une séance :

```
DELETE /api/admin/rooms/[id]/attendance?cycle=<ms>               # toute la séance
DELETE /api/admin/rooms/[id]/attendance?cycle=<ms>&identity=<id> # un participant
```

Le paramètre `cycle` est **obligatoire** dans les deux cas : une salle étant réutilisée d'une réunion à l'autre, l'omettre effacerait la présence de **toutes** les séances. Aucune suppression globale n'est donc accessible par simple oubli de paramètre. Droits : **ADMIN ou créateur de la salle** (plus restrictif que la consultation, ouverte aux modérateurs enrôlés) — l'opération est irréversible et engage la valeur probante de la feuille.

> ⚠️ La table `Attendance` est ajoutée par la migration `add_attendance` → penser à `prisma migrate deploy` lors du déploiement (voir plus bas).

---

## Chat — export de la transcription

La page animateur (`/host`) dispose d'un bouton **« Exporter »** qui télécharge le chat en `.txt` (horodatage, auteur, message).

Le chat LiveKit **n'est pas persisté** : il transite par le data channel et vit en mémoire du navigateur. Deux conséquences :

- l'export ne contient que les messages **reçus depuis la connexion de l'animateur** ;
- un **rechargement de page vide l'historique**.

C'est pourquoi le bouton est réservé à `/host` : un participant arrivé en cours de route n'exporterait qu'un fragment trompeur. Le formatage vit dans un module **pur** (`lib/chat-transcript.ts`), sans dépendance à LiveKit ni au DOM, afin d'être réutilisable côté serveur le jour où le chat sera persisté (analyse par LLM, extraction de questions).

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

> `prisma.config.ts` charge automatiquement `.env`/`.env.local` (via `dotenv`) et utilise `process.env.DATABASE_URL` **sans aucune valeur par défaut codée en dur** (évite tout risque de pointer vers la mauvaise base). Les commandes `prisma migrate …` lisent donc l'URL depuis `.env` sans qu'on ait à la passer manuellement.

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
| POST | `/api/moodle/rooms` | Créer une salle (provisionne l'animateur si besoin) |
| GET | `/api/moodle/rooms/[id]/status` | Statut de la salle |
| GET | `/api/moodle/rooms/[id]/recordings` | Liste des enregistrements |
| POST | `/api/moodle/join` | Rejoindre en tant qu'étudiant (auto-provision `VIEWER`) |
| POST | `/api/moodle/start` | Démarrer/rejoindre en tant que modérateur |
| POST | `/api/moodle/enroll` | Enrôlement masse depuis Moodle |
| DELETE | `/api/moodle/recordings/[id]` | Supprimer un enregistrement |

> Le plugin identifie sa salle par le `roomid` renvoyé à la création, qu'il **mémorise** avec l'hôte de l'`apiurl` (colonne `roomapihost`, plugin ≥ 1.2.7). Changer l'URL du backend (préprod ↔ prod) rend ce `roomid` caduc : le plugin le détecte, oublie le lien et propose « Créer la salle » sur le backend courant. Un `404` sur `/status` déclenche la même auto-réparation.

> **Provisionnement de l'animateur (plugin ≥ 1.2.9).** `rooms` et `start` reçoivent `moderatorName` (le `fullname` Moodle) et **créent le compte animateur** s'il n'existe pas (rôle `MODERATOR`), ou promeuvent un `VIEWER` — jamais de rétrogradation d'un `ADMIN` (`lib/moodle-moderator.ts`). Un enseignant qui n'a jamais ouvert la plateforme peut ainsi créer/démarrer sa session. C'est le même niveau de confiance que le provisionnement étudiant (`join`) : appel authentifié par `MOODLE_API_KEY`, capacité `mod/livestream:moderate` déjà vérifiée côté plugin. Piloté par le réglage `moodle_auto_moderator` (cf. Paramètres). `moderatorName` est **facultatif** côté backend (compatible plugins < 1.2.9).

### Routes d'administration (session ADMIN requise)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET / PATCH | `/api/admin/settings` | Lire / modifier les réglages globaux |
| DELETE | `/api/admin/users` | Supprimer un utilisateur (garde-fous, cf. Rôles) |
| GET | `/api/admin/rooms/[id]/attendance` | Liste de présence (ADMIN ou modérateur enrôlé) |
| DELETE | `/api/admin/rooms/[id]/attendance` | Supprimer une séance / un participant (ADMIN ou créateur) |

### Route publique

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/room-status?roomName=` | Un animateur est-il connecté ? (booléen, sans authentification — les invités rejoignent par simple lien) |

---

## Rôles utilisateurs

| Rôle | Redirection | Accès |
|------|-------------|-------|
| `ADMIN` | `/admin` | Gestion complète — salles, utilisateurs, enregistrements, statut services, paramètres |
| `MODERATOR` | `/moderator` | Ses salles, enrôlement CSV/individuel, ses enregistrements |
| `VIEWER` | `/student` | Sessions auxquelles il est enrôlé |

> Un `MODERATOR` voit **ses salles + celles où il est enrôlé** (`/api/admin/rooms`) : un enseignant auto-enrôlé sur un cours Moodle voit donc ce cours et peut le **Démarrer** (hors ligne) ou le **Rejoindre** (déjà LIVE).

### Rôle plateforme vs rôle session (co-animateur)

Il faut distinguer le **rôle du compte** (`ADMIN`/`MODERATOR`/`VIEWER`, ci-dessus) du **rôle dans une session** (animateur / participant) :

- L'autorisation des actions d'animateur (enregistrer, kick, diffuser, tableau blanc, arrêter) passe par **`assertRoomHost`** (`lib/controller.ts`) : est autorisé le **créateur** de la salle **OU tout modérateur connecté** (métadonnée `isModerator` du jeton). Un 2ᵉ `ADMIN`/`MODERATOR` qui **Rejoint** une session en cours devient donc **co-animateur** à parité, **sans déposséder** le premier.
- Rejoindre une session déjà LIVE **ne réécrit pas** le `creator_identity` (`createStream`/`moodle/start` idempotents) : le créateur d'origine reste propriétaire.
- Un `VIEWER` (étudiant) ne peut jamais animer ; il rejoint en **participant** (et peut être invité « sur scène » avec micro ouvert par défaut).

### Règle « étudiant » (claim Keycloak `affiliation`)

Un compte dont l'ID token porte `"affiliation": "Etudiant"` est **toujours forcé en `VIEWER`**, quels que soient ses rôles Keycloak — un étudiant ne peut donc jamais être modérateur ni administrateur. Cette règle est **permanente** et indépendante du réglage de blocage ci-dessous.

Les comptes **sans** ce champ ne sont concernés par aucune règle étudiante (ni forçage, ni blocage).

### Suppression d'un utilisateur

`DELETE /api/admin/users` (ADMIN), via la corbeille de la liste. Trois garde-fous :

- **auto-suppression interdite** ;
- **refus (409) si l'utilisateur a créé des salles** — `Session.creatorId` est obligatoire et sans cascade : la suppression violerait la contrainte FK et orphelinerait salles, enregistrements et présences. Supprimer/réassigner ses salles d'abord ;
- sinon suppression sûre : les **inscriptions** suivent en cascade, les **présences sont conservées** (`Attendance.userId` passe à `NULL`, l'historique reste exploitable).

> ⚠️ Supprimer un compte n'est **pas** un bannissement : à sa prochaine connexion (Moodle ou SSO), l'utilisateur est **recréé** en `VIEWER`.

---

## Paramètres de la plateforme

Onglet **Paramètres** de `/admin` (ADMIN uniquement). Les réglages sont stockés dans la table **`AppSetting`** (clé/valeur), conçue pour accueillir de nouveaux paramètres **sans migration** à chaque ajout.

| Clé | Valeurs | Défaut | Effet |
|-----|---------|--------|-------|
| `block_students` | `on` / `off` | `off` | Interdit la connexion **SSO directe** aux comptes `affiliation = Etudiant` |
| `moodle_auto_moderator` | `on` / `off` | `on` | Provisionne/promeut automatiquement en `MODERATOR` l'enseignant qui crée/démarre une session depuis Moodle. `off` → attribution manuelle du rôle (l'enseignant sans compte modérateur voit sa session refusée). Le garde-fou `affiliation=Etudiant → VIEWER` reste appliqué à la connexion SSO. |

Quand `block_students = on`, un étudiant qui tente de se connecter sur la plateforme est redirigé vers **`/acces-refuse`** (message + lien vers `https://ent.unchk.sn`) au lieu d'ouvrir une session.

**L'accès via Moodle n'est PAS concerné** : `/api/moodle/join` s'authentifie par `MOODLE_API_KEY` et non par SSO — un étudiant venant d'un lien Moodle accède toujours à son cours.

Le blocage porte sur l'`affiliation` et non sur le rôle : un `ADMIN` ne peut donc pas se verrouiller hors de la plateforme. Il s'applique **à la connexion** — une session étudiante déjà ouverte reste valide jusqu'à son expiration.

> ⚠️ La table `AppSetting` est ajoutée par la migration `add_app_setting` → `prisma migrate deploy` obligatoire au déploiement. Sans elle, **toute connexion SSO échoue** (le callback `signIn` lit le réglage).

---

## Accès spectateur : modérateur requis

Un lien `/watch/<salle>` ne donne accès à la session que si un **animateur est réellement connecté**. Le contrôle (`isModeratorPresent`, `lib/controller.ts`) interroge **l'état réel du SFU** — et non le statut `LIVE` en base, qui peut rester bloqué si le webhook `room_finished` est perdu. Trois conditions cumulatives : la salle existe, ses métadonnées portent un `creator_identity`, et ce créateur est connecté.

- Côté serveur : `joinStream` refuse d'émettre un jeton (**403 `NO_MODERATOR`**) — c'est le contrôle non contournable.
- Côté client : la page `/watch` interroge `GET /api/room-status` **une seule fois au chargement** (aucun sondage répété : un amphi entier en attente produirait sinon une requête par étudiant et par intervalle), affiche un message d'attente puis redirige vers `returnUrl`.
- Un cache de 5 s avec regroupement des appels concurrents absorbe la rafale de connexions simultanées (mesuré : 200 requêtes → 3 appels au SFU).

> Le lien Moodle porteur d'un `?token=` déjà émis n'est verrouillé que **visuellement** : son jeton reste valide côté LiveKit. Le verrou serveur pour ce chemin relèverait de `/api/moodle/join`.

---

## Quitter / Terminer une session

Sur `/host`, l'animateur dispose de **deux actions distinctes** (rendu possible par le co-animateur) :

| Bouton | Effet |
|--------|-------|
| **Quitter** (discret) | L'animateur **se déconnecte** (`room.disconnect`) **sans détruire la salle** : la session et l'enregistrement **continuent** pour les autres. Sa présence est refermée (`participant_left`). Si c'est le **dernier animateur** (`/api/other-hosts` → `hasOtherHostConnected`), un **avertissement** prévient que la session restera sans pilote. |
| **Terminer** (rouge) | Ferme la session **pour tout le monde** : arrêt de l'enregistrement + `deleteRoom` + `ENDED`. `stop_stream` supprime la salle **d'abord** et ne marque `ENDED` **que si l'arrêt a réussi** (403 non-animateur, 502 LiveKit injoignable) — plus de faux succès. |

> Tout **animateur** (créateur ou co-animateur, via `assertRoomHost`) peut Quitter ou Terminer.

---

## Salon sans animateur — arrêt après 15 min

Quand un salon LIVE n'a plus d'animateur connecté mais garde des spectateurs :
- Les étudiants voient un **bandeau + chronomètre de 15 min** : « L'enseignant n'est plus dans la session — sans reconnexion, elle sera arrêtée dans mm:ss ».
- Le **retour d'un animateur remet le compteur à zéro** ; s'il repart, il redémarre.
- À l'expiration, la **session est arrêtée** (`deleteRoom`) et l'enseignant **prévenu par e-mail**.

Mécanique : marqueur `no_moderator_since` dans les **métadonnées de la salle LiveKit** (aucune migration). Posé/effacé par `/api/session-presence` (sondé par `/watch` ~20 s) et par le cron. Le décompte est piloté côté client pour la précision (`/api/session-timeout`, **re-vérifié serveur** avant d'arrêter) ; le **cron `/api/cron/reconcile-recordings`** sert de filet (`sweepNoModerator`) si aucun onglet étudiant n'est ouvert. Occupation calculée par `getRoomOccupancy` (`lib/controller.ts`), participants système (egress/OBS) exclus.

## Notifications e-mail (SMTP)

`lib/mailer.ts` (nodemailer) envoie des e-mails via SMTP (variables `SMTP_*` / `MAIL_FROM`). **Inerte tant que `SMTP_HOST` est absent** (log, aucune erreur — la fonctionnalité ne casse rien si le SMTP n'est pas configuré). Premier usage câblé : prévenir l'**enseignant** quand sa session est arrêtée automatiquement (sans-animateur 15 min, ou plafond 3 h) — `emailSessionClosed` dans `lib/session-lifecycle.ts`.

**Chiffrement.** `SMTP_SECURE` distingue les deux modes :
- `SMTP_SECURE=true` → port **465** (SSL implicite dès la connexion) ;
- `SMTP_SECURE=false` → port **587** (ou 25) : le mailer **force STARTTLS** (`requireTLS`) et **refuse d'envoyer en clair** si le serveur ne propose pas le chiffrement (évite toute fuite d'identifiants).

> ⚠️ Sur le port **587**, mettre `SMTP_SECURE=false` (STARTTLS), **pas** `true` — sinon erreur `wrong version number` (le client tente du SSL sur un port qui attend du STARTTLS).

`sendMail()` ne lève jamais : retourne `true`/`false` et journalise l'échec, pour ne jamais casser le flux métier appelant.

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

**3. Critère READY (fin du faux « disponible »).**
Un enregistrement passe `READY` seulement si **les trois** conditions sont réunies
(`lib/egress.ts`, chemin unique `finalizeRecording` partagé par le webhook et la
réconciliation) : statut egress `EGRESS_COMPLETE`/`EGRESS_LIMIT_REACHED`, **taille > 0**,
et **fichier réellement présent sur MinIO** (`HeadObject`). Sinon → `FAILED`. Un egress
`FAILED`/`ABORTED` (ou un fichier jamais monté sur le bucket) ne peut plus être annoncé
`READY` (approche inspirée de suitenumerique/meet). Finalisation **idempotente** (aucun
écrasement d'un statut final).

**4. Arrêt automatique (anti-fuite).**
Le web egress n'étant pas lié au cycle de vie de la room, plusieurs filets :
- **`stop_stream` arrête lui-même** l'egress `PROCESSING` de la session (idempotent),
  sans dépendre du webhook — indispensable avec le co-animateur (l'état `recording` du
  client n'est pas partagé entre animateurs) ;
- le webhook `room_finished` arrête tout egress résiduel de la salle (après
  `empty_timeout`, 300 s, cf. `livekit-server.yaml`) ;
- ⚠️ l'ancien filet client `pagehide` a été **retiré** : l'enregistrement est une
  ressource de **session**, pas d'un animateur — le couper au départ d'un seul cassait
  la capture des autres.

**5. Réconciliation ACTIVE des `PROCESSING` bloqués.**
Si un webhook `egress_ended` est manqué, une ligne peut rester `PROCESSING`. Elle est
réconciliée avec l'état réel de LiveKit (`listEgress`) :
- par un **cron système** `/api/cron/reconcile-recordings` (protégé par `CRON_SECRET`,
  comparaison à temps constant, ~toutes les 10 min) — indépendant de toute présence humaine ;
- à l'affichage des listes (`/api/recordings/me`, `/api/admin/recordings`) et au polling
  de statut (`/api/recording-status`, après 60 s).
> Config système (hors git, à reproduire en prod) : `CRON_SECRET` dans `.env`,
> `/usr/local/bin/livestream-reconcile.sh`, `/etc/cron.d/livestream-reconcile`.

**6. Plafond de durée (3 h).**
Cap serveur via `session_limits.file_output_max_duration: 3h` dans `/opt/livekit/egress.yaml`
(**hors git — à répliquer sur la prod** + restart du conteneur egress). À l'échéance :
`EGRESS_LIMIT_REACHED` → fichier finalisé `READY`, puis le webhook **termine toute la
session** (`deleteRoom`). Côté animateur, une **alerte à 2h50** prévient de l'arrêt imminent.

**7. Dépendance Redis / worker egress.**
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
| **v1.2** | **Qualité vidéo** : options LiveKit centralisées (`lib/livekit-options.ts`) — adaptiveStream, dynacast, plafonds de publication ; suppression de la couche simulcast à demi-résolution du **partage d'écran** (slides illisibles côté participant). Correction ICE **STUN + TURN/UDP** côté SFU (voir Infrastructure) — cause racine du flou. **Responsivité** des pages `/host` et `/watch`. Caméra interdite aux spectateurs montés sur scène (micro + partage d'écran seulement). Tableau blanc : synchronisation d'historique robuste (chunking, anti-tempête, persistance locale, autorisation d'écriture). |
| **v1.2.1** | **Accès** : un lien `/watch` requiert un **animateur réellement connecté** (403 `NO_MODERATOR` + écran d'information). **Présence** : suppression d'une séance ou d'un participant. **Chat** : export `.txt` de la transcription depuis `/host`. **Utilisateurs** : suppression (avec garde-fous), tris par date de création et par rôle. **Paramètres** : nouvelle table `AppSetting` + réglage « Interdire l'accès aux étudiants » (claim `affiliation`), page `/acces-refuse`. Règle permanente : un étudiant est toujours `VIEWER`. |
| **v1.3** | **Enregistrements fiables** : verrou anti-doublon, sécurisation de `/api/egress-token` (mandat HMAC signé), critère `READY` = statut + taille > 0 + fichier réellement sur MinIO (`HeadObject`), réconciliation **active** par cron des `PROCESSING` bloqués. **Co-animateur** : `assertRoomHost` (créateur **ou** modérateur connecté), Démarrer/**Rejoindre** une session en cours sans dépossession, tableau blanc de l'egress ouvert à tout animateur. **Provisionnement Moodle** : l'enseignant/tuteur est auto-créé/promu `MODERATOR` (réglage `moodle_auto_moderator`). **Cycle de session** : boutons **Quitter** (sans détruire la salle) / **Terminer**, `stop_stream` sans faux succès. **Plafond 3 h** (`session_limits` egress) + alerte à 2h50. **Design** : bouton micro icône, micro ouvert par défaut sur scène. |

---

## Équipe

**DITSI — Université Numérique Cheikh Hamidou Kane (UN-CHK)**
© 2026 — Tous droits réservés
