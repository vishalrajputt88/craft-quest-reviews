-- CreateEnum
CREATE TYPE "FrameMode" AS ENUM ('PNG', 'CSS');

-- CreateEnum
CREATE TYPE "FrameRule" AS ENUM ('ALL', 'COLLECTION', 'TAG', 'PRODUCT_TYPE', 'PRODUCT');

-- CreateTable
CREATE TABLE "FrameStyle" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchValues" TEXT[],
    "mode" "FrameMode" NOT NULL DEFAULT 'CSS',
    "overlayUrl" TEXT,
    "overlayFileId" TEXT,
    "overlayWidth" INTEGER,
    "overlayHeight" INTEGER,
    "sliceTop" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "sliceRight" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "sliceBottom" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "sliceLeft" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "face" TEXT NOT NULL DEFAULT 'linear-gradient(135deg,#2b2b2b,#141414 45%,#303030)',
    "edge" TEXT NOT NULL DEFAULT '#0a0a0a',
    "inner" TEXT NOT NULL DEFAULT '#3a3a3a',
    "thickness" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "matEnabled" BOOLEAN NOT NULL DEFAULT true,
    "matColor" TEXT NOT NULL DEFAULT '#f6f4ef',
    "matWidth" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "swatchColor" TEXT NOT NULL DEFAULT '#1c1c1c',
    "swatchUrl" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrameStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameSet" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "styleIds" TEXT[],
    "rule" "FrameRule" NOT NULL DEFAULT 'ALL',
    "ruleValues" TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrameSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameSettings" (
    "shop" TEXT NOT NULL,
    "sizeOption" TEXT NOT NULL DEFAULT 'Size',
    "colorOption" TEXT NOT NULL DEFAULT 'Frame Colour',
    "roomImageUrl" TEXT,
    "showScale" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrameSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE INDEX "FrameStyle_shop_active_sort_idx" ON "FrameStyle"("shop", "active", "sort");

-- CreateIndex
CREATE INDEX "FrameSet_shop_active_priority_idx" ON "FrameSet"("shop", "active", "priority");
