// Registre centralisé des icônes autorisées (Lucide).
// Importer TOUJOURS depuis ce fichier (et non "lucide-react") pour garder un
// jeu d'icônes cohérent et éviter la dispersion.
//
// Conventions d'usage :
//   - taille : 14 (inline dans du texte), 16 (boutons), 18–20 (tuiles), 24 (sections)
//   - trait  : strokeWidth={2} (défaut Lucide)
//   - couleur: hérite de currentColor (ne jamais coder une couleur en dur)
//   - a11y   : décoratif → rien ; bouton icône-seule → aria-label sur le bouton
export {
  Play,
  Link,
  Download,
  Upload,
  RefreshCw,
  X,
  User,
  Users,
  Calendar,
  Mail,
  Check,
  Video,
  Clapperboard,
  TriangleAlert,
  Circle,
  Monitor,
  Clock,
  Trash2,
  Eye,
  ChevronDown,
} from "lucide-react"
