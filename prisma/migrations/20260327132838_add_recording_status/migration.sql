-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Recording" ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "RecordingStatus" NOT NULL DEFAULT 'PROCESSING',
ALTER COLUMN "s3Key" SET DEFAULT '',
ALTER COLUMN "s3Bucket" SET DEFAULT '',
ALTER COLUMN "filename" SET DEFAULT '';
