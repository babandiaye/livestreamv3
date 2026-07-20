// Formatage d'une transcription de chat en texte brut.
//
// Module volontairement PUR et sans dépendance à LiveKit ni au DOM : il est
// appelé aujourd'hui depuis le navigateur (bouton « Exporter » du chat), mais
// il est destiné à être réutilisé tel quel côté serveur quand le chat sera
// persisté en base et soumis à Ollama pour extraction des questions
// pertinentes. Ne rien y introduire qui dépende de `window`.

/** Forme minimale d'un message, compatible avec `ReceivedChatMessage` de LiveKit. */
export type TranscriptMessage = {
  timestamp: number;
  message: string;
  from?: { name?: string; identity?: string };
};

const HORODATAGE = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const DATE_COMPLETE = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "medium",
});

/** Nom affichable d'un émetteur, avec repli sur l'identité puis « Inconnu ». */
export function senderLabel(msg: TranscriptMessage): string {
  return msg.from?.name?.trim() || msg.from?.identity?.trim() || "Inconnu";
}

/**
 * Rend la transcription en texte brut, un message par ligne :
 *
 *   [14:32:07] Awa NDIAYE : Bonjour tout le monde
 *
 * Les messages sont triés par horodatage croissant (l'ordre de réception n'est
 * pas garanti sur un data channel) et les messages vides sont écartés — les
 * commandes internes de l'application transitent par le même canal.
 */
export function formatChatTranscript(
  messages: TranscriptMessage[],
  roomName: string,
  exportedAt: Date = new Date()
): string {
  const ordered = messages
    .filter((m) => m.message?.trim())
    .sort((a, b) => a.timestamp - b.timestamp);

  const entete = [
    "Transcription du chat",
    `Salle : ${roomName}`,
    `Export : ${DATE_COMPLETE.format(exportedAt)}`,
    `Messages : ${ordered.length}`,
    "",
    "-".repeat(60),
    "",
  ];

  if (ordered.length === 0) {
    return [...entete, "Aucun message.", ""].join("\n");
  }

  const lignes = ordered.map(
    (m) =>
      `[${HORODATAGE.format(new Date(m.timestamp))}] ${senderLabel(m)} : ${m.message.trim()}`
  );

  return [...entete, ...lignes, ""].join("\n");
}

/** Nom de fichier de l'export : chat-<salle>-<AAAA-MM-JJ-HHmm>.txt */
export function transcriptFilename(roomName: string, exportedAt: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const horo =
    `${exportedAt.getFullYear()}-${p(exportedAt.getMonth() + 1)}-${p(exportedAt.getDate())}` +
    `-${p(exportedAt.getHours())}${p(exportedAt.getMinutes())}`;
  const salle = roomName.replace(/[^a-zA-Z0-9_-]/g, "-") || "session";
  return `chat-${salle}-${horo}.txt`;
}
