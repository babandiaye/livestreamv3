import { auth } from "@/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth()
  if (!session || !["ADMIN", "MODERATOR"].includes(session.user.role))
    return new Response("Non autorisé", { status: 403 })

  const csv = [
    "email,prenom,nom",
    "etudiant1@unchk.edu.sn,Aminata,Diallo",
    "etudiant2@unchk.edu.sn,Moussa,Ndiaye",
    "etudiant3@unchk.edu.sn,Fatou,Sow",
    "etudiant4@unchk.edu.sn,Ibrahima,Fall",
    "etudiant5@unchk.edu.sn,Mariama,Ba",
  ].join("\n")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modele-enrolements.csv"',
    },
  })
}
