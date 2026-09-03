import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { verifyDownload } from '@/lib/download-token';

export const dynamic = 'force-dynamic';

function getS3Client() {
  return new S3Client({
    region: process.env.S3_REGION!,
    endpoint: process.env.S3_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET!,
    },
    forcePathStyle: true,
  });
}

// L'app VALIDE, nginx TRANSPORTE (motif X-Accel-Redirect, 09/2026).
// Avant, cette route streamait la vidéo depuis MinIO à travers le runtime Node
// (HeadObject + parsing Range manuel + GetObject) — mesuré en prod : 528
// requêtes / 3,6 Go en 20 min transitant par next-server. Désormais elle ne
// fait que vérifier le lien signé puis répond CORPS VIDE avec X-Accel-Redirect
// vers l'emplacement nginx interne /_media/ (cf. vhost), qui proxifie MinIO
// directement. nginx/MinIO gèrent nativement les Range (206/Content-Range/416,
// y compris les suffix-ranges que l'ancien parsing cassait).
//
// PRÉREQUIS DE DÉPLOIEMENT : le bloc nginx `location /_media/ { internal; … }`
// doit exister AVANT ce code, sinon l'en-tête X-Accel-Redirect part au
// navigateur et tous les téléchargements cassent.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const exp = searchParams.get('exp');
    const sig = searchParams.get('sig');
    if (!key) return NextResponse.json({ error: 'key requis' }, { status: 400 });

    // Accès uniquement via un lien signé et non expiré (généré côté serveur par
    // /api/recordings/[id]/url ou les routes Moodle). Empêche le téléchargement
    // d'un enregistrement par simple connaissance/devinette de la clé S3.
    if (!verifyDownload(key, exp, sig)) {
      return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 403 });
    }

    const bucket = process.env.S3_BUCKET!;
    const filename = key.split('/').pop() ?? 'recording.mp4';
    // La requête du client (Range compris) est rejouée telle quelle par nginx
    // vers MinIO : on sait donc ici si la réponse finale sera un 200 ou un 206.
    const isRangeRequest = request.headers.get('range') !== null;

    // Overrides de réponse SIGNÉS : c'est MinIO lui-même qui émettra
    // Content-Type / Content-Disposition / Cache-Control (parité exacte avec
    // l'ancienne route : Cache-Control uniquement sur le 200), sans dépendre
    // des règles de préséance d'en-têtes du redirect nginx.
    // expiresIn 2 h : la signature n'est vérifiée qu'à l'ACCEPTATION de la
    // requête par MinIO (nginx la consomme immédiatement) ; chaque seek du
    // lecteur repasse ici et obtient une présignée fraîche.
    const presigned = await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: 'video/mp4',
        ResponseContentDisposition: `inline; filename="${filename}"`,
        ...(isRangeRequest ? {} : { ResponseCacheControl: 'public, max-age=3600' }),
      }),
      { expiresIn: 7200 }
    );

    // /_media/<bucket>/<clé>?<query présignée> — pathname/search déjà encodés
    // par le SDK (path-style, forcePathStyle: true).
    const u = new URL(presigned);
    return new NextResponse(null, {
      status: 200,
      headers: { 'X-Accel-Redirect': `/_media${u.pathname}${u.search}` },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    );
  }
}
