import { AudioPresets, ScreenSharePresets, VideoPresets } from "livekit-client";
import type { RoomOptions, TrackPublishDefaults } from "livekit-client";

// Réglages audio communs (chantier bande passante du 28/07/2026). Sans eux, le
// SDK applique ses défauts : preset « music » (48 kb/s) et RED actif, soit
// ~96 kb/s par abonné une fois la redondance comptée. Sur un amphi de 1 500
// spectateurs, c'est ~144 Mb/s en sortie de SFU pour de la voix mono.
//
// - audioPreset speech (24 kb/s) : Opus est conçu pour la parole et reste
//   transparent à ce débit sur une voix. NE PAS descendre à telephone (12 kb/s),
//   là il y aurait une perte audible.
// - dtx : défaut du SDK, rendu explicite — les silences ne consomment ~rien.
// - red TRUE (réactivé le 01/08/2026) : RED double chaque paquet audio et permet
//   au récepteur de reconstruire les paquets perdus. Il avait été désactivé le
//   28/07 pour économiser la bande passante, mais des MICRO-COUPURES audio sont
//   remontées en PROD → on privilégie la résilience. Coût : ~2× le débit audio
//   (voix ~24 → ~48 kb/s par abonné), négligeable face à la vidéo.
//   Ne jamais compenser une coupure en abaissant le preset (perte audible).
const audioDefaults: Pick<TrackPublishDefaults, "audioPreset" | "dtx" | "red"> = {
  audioPreset: AudioPresets.speech,
  dtx: true,
  red: true,
};

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
    ...audioDefaults,
    screenShareEncoding: ScreenSharePresets.h720fps15.encoding,
    // TEST préprod (03/09/2026) : couche basse h360fps3 pour la dégradation
    // gracieuse sous réseau contraint (même logique que /host). Avant : [] (une
    // seule couche nette). Voir la note détaillée dans publisherRoomOptions,
    // dont l'avertissement sur la lisibilité des slides.
    screenShareSimulcastLayers: [ScreenSharePresets.h360fps3],
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
    ...audioDefaults,
    videoEncoding: { maxBitrate: 1_200_000, maxFramerate: 30 },
    videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h180],
    // TEST préprod (03/09/2026) — volet « 1 Gb » : le partage d'écran de
    // l'animateur est le 1er poste de bande passante en amphi (débit × nb de
    // spectateurs). Deux leviers :
    //  - écran plafonné à 720p/15 (au lieu du défaut SDK h1080fps15 ~2,5 Mb/s)
    //    -> ~2× moins de débit par spectateur.
    //  - UNE couche basse h360fps3 (au lieu de []) pour que congestion_control
    //    + adaptiveStream servent une version légère aux réseaux contraints au
    //    lieu de perdre des paquets (retransmissions / flou de gel).
    // ⚠️ À SURVEILLER pendant le test : lisibilité des slides. Historique 19/07 :
    //    une couche basse pouvait être choisie par adaptiveStream sur un petit
    //    conteneur -> texte 360p illisible. Ici la source est déjà 720p et la
    //    basse n'est qu'un secours ; si des slides floutent SANS cause réseau,
    //    repasser screenShareSimulcastLayers à [] (ou monter la couche basse).
    screenShareEncoding: ScreenSharePresets.h720fps15.encoding,
    screenShareSimulcastLayers: [ScreenSharePresets.h360fps3],
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
// host = sa résolution de capture. Depuis le test « 1 Gb » du 03/09/2026, l'écran
// est plafonné à 720p15 (screenShareEncoding) : il est donc UPSCALÉ vers le 1080p
// du composite — les slides ENREGISTRÉES sont un peu moins fines qu'avant, contre-
// partie assumée de la division par ~2 du débit descendant. Un plan CAMÉRA plein
// cadre plafonne lui aussi à 720p (videoCaptureDefaults) puis est upscalé —
// compromis assumé depuis l'incident du 16/07.
export const egressRoomOptions: RoomOptions = {
  adaptiveStream: false,
  dynacast: false,
};
