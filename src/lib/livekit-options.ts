import { ScreenSharePresets, VideoPresets } from "livekit-client";
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
  // Un spectateur ne publie JAMAIS en temps normal — ces plafonds ne concernent
  // que le cas « monté sur scène » (micro + partage d'écran ; la caméra est
  // interdite côté serveur dans inviteToStage). 720p/15 fps suffit pour montrer
  // un document ; sans ce plafond, le partage partirait aux défauts du SDK
  // (1080p/15) et plusieurs partages simultanés rejoueraient l'incident du 16/07.
  // Réf. doc : https://docs.livekit.io/transport/media/advanced/
  publishDefaults: {
    screenShareEncoding: ScreenSharePresets.h720fps15.encoding,
    // [] = AUCUNE couche simulcast supplémentaire. Sans ce tableau vide, le SDK
    // ajoute d'office une couche à demi-résolution
    // (computeDefaultScreenShareSimulcastPresets, scaleResolutionDownBy: 2) que
    // adaptiveStream sélectionne dès que le conteneur est plus petit que la
    // source — d'où du texte encodé en 360p, illisible. Le partage d'écran est
    // du contenu statique : mieux vaut une seule couche nette.
    screenShareSimulcastLayers: [],
  },
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
    // Idem côté animateur : l'écran garde l'encodage par défaut du SDK
    // (h1080fps15, 2,5 Mb/s) mais SANS couche à demi-résolution, sinon les
    // slides partent en 960×540 chez les participants (constaté le 19/07/2026 :
    // frameHeight=492 reçu pour une source de 984 px). La caméra, elle, conserve
    // ses couches h360/h180 — c'est du contenu animé, la dégradation y est
    // acceptable et nécessaire pour les petits réseaux.
    screenShareSimulcastLayers: [],
  },
};

// Vue d'enregistrement (page /egress-layout) : doit TOUJOURS recevoir la
// meilleure couche disponible de chaque publieur.
// - adaptiveStream:false est le réglage QUI COMPTE : sinon les éléments masqués
//   ou petits du layout (PiP, canvas caché) verraient leur piste dégradée voire
//   mise en pause côté serveur — inacceptable pour un enregistrement.
// - dynacast:false est ici un no-op (dynacast agit côté ÉMETTEUR ; l'egress ne
//   publie pas), conservé par symétrie/lisibilité.
// Nuance sortie : le composite est encodé en 1080p, mais « meilleure couche » du
// host = sa résolution de capture. L'écran/slides (publisherRoomOptions ne plafonne
// pas screenShareEncoding → défaut SDK ~1080p) est du vrai 1080p ; un plan CAMÉRA
// plein cadre plafonne à 720p (videoCaptureDefaults) puis est upscalé — compromis
// assumé depuis l'incident du 16/07.
export const egressRoomOptions: RoomOptions = {
  adaptiveStream: false,
  dynacast: false,
};
