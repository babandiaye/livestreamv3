// Réactions emoji orientées « cours » : chaque emoji porte une signification
// pédagogique explicite (affichée en infobulle au survol). Source de vérité
// unique, partagée par la page animateur (/host) et la page participant (/watch).
export type CourseReaction = { emoji: string; label: string }

export const COURSE_REACTIONS: CourseReaction[] = [
  { emoji: "👏", label: "Bravo !" },
  { emoji: "👍", label: "Compris / D'accord" },
  { emoji: "❓", label: "Je n'ai pas compris" },
  { emoji: "🔇", label: "On ne vous entend pas" },
  { emoji: "🐢", label: "Trop rapide, ralentissez" },
  { emoji: "⏩", label: "Trop lent, accélérez" },
  { emoji: "📖", label: "Laissez le temps de lire" },
  { emoji: "👀", label: "On ne voit pas bien (illisible)" },
  { emoji: "✅", label: "C'est fait / terminé" },
  { emoji: "🎉", label: "Super !" },
]
