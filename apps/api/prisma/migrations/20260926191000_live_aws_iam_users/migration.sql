-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'IAM_USER';

-- AlterTable
ALTER TABLE "AwsAccount" ADD COLUMN "accessKeyId" TEXT;
ALTER TABLE "AwsAccount" ADD COLUMN "secretAccessKey" TEXT;
ALTER TABLE "AwsAccount" ADD COLUMN "sessionToken" TEXT;
