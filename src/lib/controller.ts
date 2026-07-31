import {
  AccessToken,
  CreateIngressOptions,
  IngressAudioEncodingPreset,
  IngressAudioOptions,
  IngressClient,
  IngressInfo,
  IngressInput,
  IngressVideoEncodingPreset,
  IngressVideoOptions,
  ParticipantInfo,
  ParticipantPermission,
  RoomServiceClient,
  TrackSource,
} from "livekit-server-sdk";
import { jwtVerify } from "jose";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomMetadata = {
  creator_identity: string;
  enable_chat: boolean;
  allow_participation: boolean;
  whiteboard_open?: boolean;
};

export type ParticipantMetadata = {
  hand_raised: boolean;
  invited_to_stage: boolean;
  avatar_image: string;
};

export type Session = {
  identity: string;
  room_name: string;
};

export type ConnectionDetails = {
  token: string;
  ws_url: string;
};

export type CreateIngressParams = {
  room_name?: string;
  ingress_type?: string;
  metadata: RoomMetadata;
  create_room?: boolean; // false = la salle existe déjà (ingress vers un salon ouvert)
};

export type CreateIngressResponse = {
  ingress: IngressInfo;
  whip_token?: string;
  auth_token: string;
  connection_details: ConnectionDetails;
};

export type CreateStreamParams = {
  room_name?: string;
  metadata: RoomMetadata;
  user_id?: string; // pour la liste de présence (animateur rattaché à son compte)
};

export type CreateStreamResponse = {
  auth_token: string;
  connection_details: ConnectionDetails;
};

export type JoinStreamParams = {
  room_name: string;
  identity: string;
  user_id?: string;    // rattache la présence à un compte (étudiant authentifié)
  user_email?: string; // repli de rattachement par email (parcours Moodle/Keycloak)
};

export type JoinStreamResponse = {
  auth_token: string;
  connection_details: ConnectionDetails;
};

export type InviteToStageParams = {
  identity: string;
};

export type RemoveFromStageParams = {
  identity?: string;
};

// ─── Auth token ───────────────────────────────────────────────────────────────

export async function createAuthToken(room_name: string, identity: string): Promise<string> {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity, ttl: "10h" }
  );
  at.addGrant({ room: room_name, roomJoin: false });
  return await at.toJwt();
}

export async function getSessionFromReq(req: Request): Promise<Session> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.split(" ")[1];
  if (!token) throw new Error("No authorization header found");

  // C1 — Vérifie la SIGNATURE du JWT LiveKit (HS256 avec LIVEKIT_API_SECRET),
  // l'émetteur (iss = LIVEKIT_API_KEY) et l'expiration. Sans cette vérification,
  // n'importe quel token forgé serait accepté.
  const secret = new TextEncoder().encode(process.env.LIVEKIT_API_SECRET!);
  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: process.env.LIVEKIT_API_KEY!,
    });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new Error("Invalid or expired token");
  }

  const video = payload.video as { room?: string } | undefined;
  if (!payload.sub || !video?.room) throw new Error("Invalid token payload");

  return {
    identity: payload.sub as string,
    room_name: video.room,
  };
}

// ─── Autorisation animateur (C2) ─────────────────────────────────────────────────

// Lit isModerator dans les métadonnées d'un participant LiveKit. Ces métadonnées
// sont frappées côté serveur au moment d'émettre le jeton ; un spectateur ne peut
// pas se les attribuer (defaultPermission pose canUpdateMetadata: false, et aucun
// jeton n'accorde canUpdateOwnMetadata).
// ⚠ Toute route qui appellerait updateParticipant en reconstruisant les métadonnées
// doit préserver ce champ, sous peine d'ouvrir une élévation de privilège.
function hasModeratorMetadata(metadata?: string | null): boolean {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as { isModerator?: boolean }).isModerator === true;
  } catch {
    return false;
  }
}

// Vérifie que l'appelant a les droits d'animateur sur la salle. Lève "FORBIDDEN"
// sinon. À appeler après getSessionFromReq sur les actions réservées à l'animateur
// (kick, enregistrement, diffusion, tableau blanc).
//
// Deux voies, volontairement en OU — c'est un SUR-ENSEMBLE de l'ancienne règle
// « seul le créateur », donc aucun usage qui fonctionnait ne peut se retrouver
// bloqué :
//
//  1. creator_identity — celui qui a démarré la session. Conservé tel quel, et
//     indispensable au-delà du confort : /host arrête l'enregistrement sur
//     `pagehide`, à l'instant où l'animateur quitte la salle. Il n'est alors DÉJÀ
//     PLUS dans listParticipants ; sans cette voie, la requête échouerait en 403
//     et la capture continuerait jusqu'à la fermeture de la salle (empty_timeout
//     300 s, ou indéfiniment si un spectateur reste connecté).
//  2. tout modérateur ACTUELLEMENT CONNECTÉ (isModerator dans ses métadonnées) —
//     c'est ce qui fait le co-animateur : un second admin/modérateur qui rejoint
//     une session déjà démarrée dispose des mêmes droits, sans déposséder le
//     premier.
export async function assertRoomHost(session: Session): Promise<void> {
  const httpUrl = process.env.LIVEKIT_WS_URL!
    .replace("wss://", "https://")
    .replace("ws://", "http://");
  const roomService = new RoomServiceClient(
    httpUrl,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );
  const rooms = await roomService.listRooms([session.room_name]);
  if (rooms.length === 0) throw new Error("Room does not exist");

  let creator_identity: string | undefined;
  try {
    creator_identity = (JSON.parse(rooms[0].metadata || "{}") as RoomMetadata).creator_identity;
  } catch {
    creator_identity = undefined;
  }
  if (creator_identity && creator_identity === session.identity) return;

  const participants = await roomService.listParticipants(session.room_name);
  const me = participants.find((p) => p.identity === session.identity);
  if (me && hasModeratorMetadata(me.metadata)) return;

  throw new Error("FORBIDDEN");
}

// ─── Présence d'un modérateur ─────────────────────────────────────────────────

// Un spectateur ne doit pas pouvoir entrer dans une salle sans animateur.
//
// On ne se fie PAS au statut LIVE en base : il reste bloqué à LIVE quand le
// webhook room_finished est perdu (SFU redémarré, appli indisponible), et c'est
// précisément ce cas qui laissait des salles « ouvertes » sans personne dedans.
// On interroge donc l'état réel du SFU.
//
// Trois conditions cumulatives :
//   1. la salle existe côté LiveKit ;
//   2. ses métadonnées portent un creator_identity — une salle auto-créée par
//      l'arrivée d'un spectateur a des métadonnées VIDES, seul /api/moodle/start
//      (ou createStream) les renseigne ;
//   3. ce créateur est effectivement connecté en ce moment.
async function queryModeratorPresence(room_name: string): Promise<boolean> {
  const httpUrl = process.env.LIVEKIT_WS_URL!
    .replace("wss://", "https://")
    .replace("ws://", "http://");
  const roomService = new RoomServiceClient(
    httpUrl,
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
  );

  const rooms = await roomService.listRooms([room_name]);
  if (rooms.length === 0) return false;

  let creator_identity: string | undefined;
  try {
    creator_identity = (JSON.parse(rooms[0].metadata || "{}") as RoomMetadata).creator_identity;
  } catch {
    creator_identity = undefined;
  }
  // Métadonnées vides = salle auto-créée par l'arrivée d'un spectateur : personne
  // ne l'anime, la condition 2 ci-dessous ne trouvera aucun modérateur non plus.
  if (!creator_identity) return false;

  const participants = await roomService.listParticipants(room_name);
  // Élargi au co-animateur : le créateur OU n'importe quel modérateur connecté
  // tient la salle. Sans ce OU, le départ de celui qui a démarré renverrait tous
  // les spectateurs en salle d'attente alors qu'un autre modérateur anime encore.
  return participants.some(
    (p) => p.identity === creator_identity || hasModeratorMetadata(p.metadata)
  );
}

// Cache + regroupement des appels concurrents.
//
// L'écran d'attente est sondé par CHAQUE spectateur : 1000 étudiants massés
// devant un cours qui n'a pas commencé produiraient sinon ~200 appels Twirp par
// seconde au SFU, dont un listParticipants qui sérialise toute la salle — et ce
// au pire moment, juste avant le démarrage.
//
// - `presenceCache` : une interrogation du SFU par salle et par TTL, quel que
//   soit le nombre de spectateurs.
// - `inFlight` : sans lui, l'expiration du TTL déclencherait un appel par
//   requête simultanée (effet de meute au moment précis de la péremption). Les
//   appelants concurrents partagent la même promesse.
const PRESENCE_TTL_MS = 5_000;
const presenceCache = new Map<string, { value: boolean; expiresAt: number }>();
const inFlight = new Map<string, Promise<boolean>>();

export async function isModeratorPresent(
  room_name: string,
  // Le contrôle d'accès réel (joinStream) interroge le SFU sans cache : il n'est
  // appelé qu'à la soumission du formulaire, donc rare. Seul l'affichage de
  // l'écran d'attente, lui massivement sollicité, se contente du cache.
  { cached = false }: { cached?: boolean } = {}
): Promise<boolean> {
  if (!cached) return queryModeratorPresence(room_name);

  const now = Date.now();
  const hit = presenceCache.get(room_name);
  if (hit && hit.expiresAt > now) return hit.value;

  const pending = inFlight.get(room_name);
  if (pending) return pending;

  const promise = queryModeratorPresence(room_name)
    .then((value) => {
      presenceCache.set(room_name, { value, expiresAt: Date.now() + PRESENCE_TTL_MS });
      // Purge opportuniste : les salles sondées puis abandonnées ne doivent pas
      // faire croître la table indéfiniment.
      if (presenceCache.size > 500) {
        const t = Date.now();
        for (const [k, v] of presenceCache) if (v.expiresAt <= t) presenceCache.delete(k);
      }
      return value;
    })
    .finally(() => inFlight.delete(room_name));

  inFlight.set(room_name, promise);
  return promise;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultPermission(): ParticipantPermission {
  return new ParticipantPermission({
    canSubscribe: true,
    canPublish: false,
    canPublishData: true,
    hidden: false,
    recorder: false,
    canUpdateMetadata: false,
  });
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class Controller {
  private ingressService: IngressClient;
  private roomService: RoomServiceClient;

  constructor() {
    const httpUrl = process.env.LIVEKIT_WS_URL!
      .replace("wss://", "https://")
      .replace("ws://", "http://");

    this.ingressService = new IngressClient(
      httpUrl,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );
    this.roomService = new RoomServiceClient(
      httpUrl,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );
  }

  async createIngress({
    metadata,
    room_name,
    ingress_type = "rtmp",
    create_room = true,
  }: CreateIngressParams): Promise<CreateIngressResponse> {
    if (!room_name) room_name = generateRoomId();

    if (create_room) {
      await this.roomService.createRoom({
        name: room_name,
        metadata: JSON.stringify(metadata),
      });
    }

    const options: CreateIngressOptions = {
      name: room_name,
      roomName: room_name,
      participantName: metadata.creator_identity + " (via OBS)",
      participantIdentity: metadata.creator_identity + " (via OBS)",
    };

    if (ingress_type === "whip") {
      options.bypassTranscoding = true;
    } else {
      options.video = new IngressVideoOptions({
        source: TrackSource.CAMERA,
        encodingOptions: {
          case: "preset",
          value: IngressVideoEncodingPreset.H264_1080P_30FPS_3_LAYERS,
        },
      });
      options.audio = new IngressAudioOptions({
        source: TrackSource.MICROPHONE,
        encodingOptions: {
          case: "preset",
          value: IngressAudioEncodingPreset.OPUS_STEREO_96KBPS,
        },
      });
    }

    const ingress = await this.ingressService.createIngress(
      ingress_type === "whip" ? IngressInput.WHIP_INPUT : IngressInput.RTMP_INPUT,
      options
    );

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: metadata.creator_identity, ttl: "10h" }
    );
    at.addGrant({
      room: room_name,
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
    });

    const whip_token = ingress_type === "whip" ? ingress.streamKey : undefined;

    return {
      ingress,
      whip_token,
      auth_token: await createAuthToken(room_name, metadata.creator_identity),
      connection_details: {
        ws_url: process.env.LIVEKIT_WS_URL!,
        token: await at.toJwt(),
      },
    };
  }

  async createStream({ metadata, room_name, user_id }: CreateStreamParams): Promise<CreateStreamResponse> {
    if (!room_name) room_name = generateRoomId();

    // Une salle déjà démarrée garde SON créateur : le second animateur rejoint,
    // il ne reprend pas la salle. Sans cette lecture préalable, l'ancien
    // updateRoomMetadata inconditionnel transférait creator_identity au dernier
    // arrivé, et le premier perdait silencieusement l'enregistrement, l'exclusion
    // et l'arrêt. Il reste co-animateur par la métadonnée isModerator de son
    // jeton (cf. assertRoomHost).
    // Effet de bord assumé : en mode rejoindre, enable_chat / allow_participation
    // restent ceux fixés au démarrage — les modifier ne prendra effet qu'à la
    // prochaine ouverture de la salle.
    let existingCreator: string | undefined;
    try {
      const existing = await this.roomService.listRooms([room_name]);
      existingCreator = existing.length
        ? (JSON.parse(existing[0].metadata || "{}") as RoomMetadata).creator_identity
        : undefined;
    } catch {
      existingCreator = undefined;
    }

    if (!existingCreator) {
      await this.roomService.createRoom({
        name: room_name,
        metadata: JSON.stringify(metadata),
      });
      // createRoom est un no-op si la salle existe déjà (ex. auto-créée vide parce
      // qu'un spectateur a rejoint /watch avant le démarrage) : dans ce cas il
      // n'écrase PAS les métadonnées. On force donc creator_identity ici, sinon
      // inviteToStage/kick/enregistrement échouent faute de créateur identifiable.
      await this.roomService.updateRoomMetadata(room_name, JSON.stringify(metadata));
    }

    // L'animateur figure dans la liste de présence en tant que modérateur.
    const attendee: Record<string, unknown> = { isModerator: true };
    if (user_id) attendee.userId = user_id;

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: metadata.creator_identity, metadata: JSON.stringify(attendee), ttl: "10h" }
    );
    at.addGrant({
      room: room_name,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      auth_token: await createAuthToken(room_name, metadata.creator_identity),
      connection_details: {
        ws_url: process.env.LIVEKIT_WS_URL!,
        token: await at.toJwt(),
      },
    };
  }

  async stopStream(session: Session) {
    await assertRoomHost(session); // créateur OU co-animateur connecté
    await this.roomService.deleteRoom(session.room_name);
  }

  async joinStream({ identity: displayName, room_name, user_id, user_email }: JoinStreamParams): Promise<JoinStreamResponse> {
    // Refus d'émettre un jeton tant qu'aucun animateur n'est présent. Sans ce
    // garde-fou, le simple fait d'ouvrir un lien /watch faisait auto-créer la
    // salle par LiveKit : les spectateurs se retrouvaient seuls dans une salle
    // vide en croyant le cours commencé, et la feuille de présence enregistrait
    // des séances fictives. Le contrôle est ici, côté serveur : l'écran d'attente
    // du client n'est qu'un confort, il est contournable.
    if (!(await isModeratorPresent(room_name))) {
      throw new Error("NO_MODERATOR");
    }

    const identity = crypto.randomUUID();

    // Référence utilisateur pour la liste de présence (lue par le webhook au
    // participant_joined). Vide pour un invité anonyme (/watch sans compte).
    const attendee: Record<string, unknown> = { isModerator: false };
    if (user_id) attendee.userId = user_id;
    if (user_email) attendee.email = user_email;

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity, name: displayName, metadata: JSON.stringify(attendee), ttl: "10h" }
    );
    at.addGrant({
      room: room_name,
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      auth_token: await createAuthToken(room_name, identity),
      connection_details: {
        ws_url: process.env.LIVEKIT_WS_URL!,
        token: await at.toJwt(),
      },
    };
  }

  async inviteToStage(session: Session, { identity }: InviteToStageParams) {
    await assertRoomHost(session); // créateur OU co-animateur connecté

    const participant = await this.roomService.getParticipant(session.room_name, identity);
    const permission = participant.permission ?? defaultPermission();
    const metadata = this.getOrCreateParticipantMetadata(participant);
    metadata.invited_to_stage = true;
    permission.canPublish = true;
    // Plafond volontaire (cf. incident du 16/07 : tempête de caméras étudiantes) :
    // un spectateur monté sur scène publie micro + partage d'écran uniquement,
    // JAMAIS sa caméra. Garantie côté serveur, en complément du bouton caméra
    // retiré de l'interface spectateur. Réf. doc :
    // https://docs.livekit.io/transport/media/publish/
    permission.canPublishSources = [
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ];

    await this.roomService.updateParticipant(session.room_name, identity, JSON.stringify(metadata), permission);
  }

  async removeFromStage(session: Session, { identity }: RemoveFromStageParams) {
    if (!identity) identity = session.identity;

    // Un participant peut TOUJOURS se retirer lui-même de la scène : on ne
    // demande les droits d'animateur que pour retirer QUELQU'UN D'AUTRE.
    if (identity !== session.identity) {
      await assertRoomHost(session); // créateur OU co-animateur connecté
    }

    const participant = await this.roomService.getParticipant(session.room_name, identity);
    const permission = participant.permission ?? defaultPermission();
    const metadata = this.getOrCreateParticipantMetadata(participant);
    metadata.hand_raised = false;
    metadata.invited_to_stage = false;
    permission.canPublish = false;

    await this.roomService.updateParticipant(session.room_name, identity, JSON.stringify(metadata), permission);
  }

  async raiseHand(session: Session) {
    const participant = await this.roomService.getParticipant(session.room_name, session.identity);
    const permission = participant.permission ?? defaultPermission();
    const metadata = this.getOrCreateParticipantMetadata(participant);
    metadata.hand_raised = true;
    if (metadata.invited_to_stage) permission.canPublish = true;
    await this.roomService.updateParticipant(session.room_name, session.identity, JSON.stringify(metadata), permission);
  }

  async kickParticipant(room_name: string, identity: string) {
    await this.roomService.removeParticipant(room_name, identity);
  }

  // Bascule l'état « tableau blanc ouvert » dans les métadonnées de room (source
  // de vérité serveur, synchronisée à tous les participants — y compris les
  // retardataires). L'autorisation créateur est vérifiée en amont dans la route
  // via assertRoomCreator. updateRoomMetadata remplace TOUTE la chaîne : on relit
  // et on fusionne pour préserver creator_identity/enable_chat/allow_participation.
  // Réf. doc : https://docs.livekit.io/transport/data/state/
  async setWhiteboardOpen(session: Session, open: boolean) {
    const rooms = await this.roomService.listRooms([session.room_name]);
    if (rooms.length === 0) throw new Error("Room does not exist");
    let meta: RoomMetadata;
    try {
      meta = JSON.parse(rooms[0].metadata || "{}") as RoomMetadata;
    } catch {
      meta = {} as RoomMetadata;
    }
    meta.whiteboard_open = open;
    await this.roomService.updateRoomMetadata(session.room_name, JSON.stringify(meta));
  }

  getOrCreateParticipantMetadata(participant: ParticipantInfo): ParticipantMetadata {
    if (participant.metadata) return JSON.parse(participant.metadata) as ParticipantMetadata;
    return {
      hand_raised: false,
      invited_to_stage: false,
      avatar_image: `https://api.multiavatar.com/${participant.identity}.png`,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRoomId(): string {
  return `${randomString(4)}-${randomString(4)}`;
}

function randomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
