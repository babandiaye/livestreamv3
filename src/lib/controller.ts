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

// ─── Autorisation créateur (C2) ─────────────────────────────────────────────────

// Vérifie que l'appelant est le créateur de la salle (creator_identity dans les
// métadonnées). Lève "FORBIDDEN" sinon. À appeler après getSessionFromReq sur les
// actions réservées à l'animateur (kick, enregistrement, diffusion).
export async function assertRoomCreator(session: Session): Promise<void> {
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
  if (!creator_identity || creator_identity !== session.identity) {
    throw new Error("FORBIDDEN");
  }
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

    await this.roomService.createRoom({
      name: room_name,
      metadata: JSON.stringify(metadata),
    });

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
    const rooms = await this.roomService.listRooms([session.room_name]);
    if (rooms.length === 0) throw new Error("Room does not exist");
    const creator_identity = (JSON.parse(rooms[0].metadata) as RoomMetadata).creator_identity;
    if (creator_identity !== session.identity) throw new Error("Only the creator can stop the stream");
    await this.roomService.deleteRoom(session.room_name);
  }

  async joinStream({ identity: displayName, room_name, user_id, user_email }: JoinStreamParams): Promise<JoinStreamResponse> {
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
    const rooms = await this.roomService.listRooms([session.room_name]);
    if (rooms.length === 0) throw new Error("Room does not exist");
    const creator_identity = (JSON.parse(rooms[0].metadata) as RoomMetadata).creator_identity;
    if (creator_identity !== session.identity) throw new Error("Only the creator can invite to stage");

    const participant = await this.roomService.getParticipant(session.room_name, identity);
    const permission = participant.permission ?? defaultPermission();
    const metadata = this.getOrCreateParticipantMetadata(participant);
    metadata.invited_to_stage = true;
    permission.canPublish = true;

    await this.roomService.updateParticipant(session.room_name, identity, JSON.stringify(metadata), permission);
  }

  async removeFromStage(session: Session, { identity }: RemoveFromStageParams) {
    if (!identity) identity = session.identity;

    const rooms = await this.roomService.listRooms([session.room_name]);
    if (rooms.length === 0) throw new Error("Room does not exist");
    const creator_identity = (JSON.parse(rooms[0].metadata) as RoomMetadata).creator_identity;
    if (creator_identity !== session.identity && identity !== session.identity) {
      throw new Error("Only the creator or the participant can remove from stage");
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
