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
};

export type CreateStreamResponse = {
  auth_token: string;
  connection_details: ConnectionDetails;
};

export type JoinStreamParams = {
  room_name: string;
  identity: string;
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

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  if (!payload.sub || !payload.video?.room) throw new Error("Invalid token payload");

  return {
    identity: payload.sub,
    room_name: payload.video.room,
  };
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
  }: CreateIngressParams): Promise<CreateIngressResponse> {
    if (!room_name) room_name = generateRoomId();

    await this.roomService.createRoom({
      name: room_name,
      metadata: JSON.stringify(metadata),
    });

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

  async createStream({ metadata, room_name }: CreateStreamParams): Promise<CreateStreamResponse> {
    if (!room_name) room_name = generateRoomId();

    await this.roomService.createRoom({
      name: room_name,
      metadata: JSON.stringify(metadata),
    });

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity: metadata.creator_identity, ttl: "10h" }
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

  async joinStream({ identity: displayName, room_name }: JoinStreamParams): Promise<JoinStreamResponse> {
    const identity = crypto.randomUUID();

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
      { identity, name: displayName, ttl: "10h" }
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
