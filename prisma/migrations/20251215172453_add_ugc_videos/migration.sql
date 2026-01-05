-- CreateTable
CREATE TABLE "UgcVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" INTEGER,
    "sourceAuthor" TEXT,
    "sourceType" TEXT,
    "productId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "UgcVideo_shop_idx" ON "UgcVideo"("shop");

-- CreateIndex
CREATE INDEX "UgcVideo_shop_isActive_idx" ON "UgcVideo"("shop", "isActive");
