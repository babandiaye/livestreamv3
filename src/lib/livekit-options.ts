import { VideoPresets } from "livekit-client";
import type { RoomOptions } from "livekit-client";

// Options LiveKit centralisées — réponse à l'incident du 16/07/2026 (932
// participants, lien 1 GbE saturé par une activation groupée de caméras).
// Réf. doc : https://docs.livekit.io/transport/media/advanced/ (simulcast,
// dynacast, presets) et https://docs.livekit.io/transport/media/subscribe/
// (adaptive stream).

// Spectateurs (page /watch) : ne reçoivent que la couche adaptée à la taille
// réelle de l'élément vidéo rendu ; les couches non consommées sont mises en
// pause chez l'émetteur (dynacast). Réduit fortement le débit sortant du SFU.
export const viewerRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
};

// Publieurs (page /host — animateur/modérateur) : mêmes optimisations + capture
// plafonnée à 720p et couches simulcast explicites h360/h180, pour que le SFU
// dispose toujours d'une couche basse à servir aux mobiles.
export const publisherRoomOptions: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
  publishDefaults: {
    videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 30 },
    videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h180],
  },
};

// Vue d'enregistrement (page /egress-layout) : doit TOUJOURS recevoir la
// meilleure couche disponible (sortie 1080p). adaptiveStream/dynacast y seraient
// contre-productifs (ils dégraderaient ou mettraient en pause le flux enregistré
// selon la taille de rendu du navigateur egress), donc explicitement désactivés.
export const egressRoomOptions: RoomOptions = {
  adaptiveStream: false,
  dynacast: false,
};
