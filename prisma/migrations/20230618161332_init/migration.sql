-- CreateEnum
CREATE TYPE "GrantTypes" AS ENUM ('client_credentials', 'authorization_code', 'refresh_token', 'implicit', 'password');

-- CreateEnum
CREATE TYPE "CodeChallengeMethod" AS ENUM ('S256', 'plain');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(6),
    "lastLoginIP" INET,
    "createdIP" INET NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "secret" VARCHAR(255),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "redirectUris" TEXT[],
    "allowedGrants" "GrantTypes"[],

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthClient_oauthScope" (
    "clientId" UUID NOT NULL,
    "scopeId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "oauthClient_oauthScope_pkey" PRIMARY KEY ("clientId","scopeId")
);

-- CreateTable
CREATE TABLE "OAuthAuthCode" (
    "code" TEXT NOT NULL,
    "redirectUri" TEXT,
    "codeChallenge" TEXT,
    "codeChallengeMethod" "CodeChallengeMethod" NOT NULL DEFAULT 'plain',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "userId" UUID,
    "clientId" UUID NOT NULL,

    CONSTRAINT "OAuthAuthCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "accessToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "clientId" UUID NOT NULL,
    "userId" UUID,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("accessToken")
);

-- CreateTable
CREATE TABLE "OAuthScope" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OAuthClientToOAuthScope" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "_OAuthAuthCodeToOAuthScope" (
    "A" TEXT NOT NULL,
    "B" UUID NOT NULL
);

-- CreateTable
CREATE TABLE "_OAuthScopeToOAuthToken" (
    "A" UUID NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "idx_oauthclient_oauthscope_clientid" ON "oauthClient_oauthScope"("clientId");

-- CreateIndex
CREATE INDEX "idx_oauthclient_oauthscope_scopeid" ON "oauthClient_oauthScope"("scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_refreshToken_key" ON "OAuthToken"("refreshToken");

-- CreateIndex
CREATE INDEX "idx_oauthtoken_accesstoken" ON "OAuthToken"("accessToken");

-- CreateIndex
CREATE INDEX "idx_oauthtoken_refreshtoken" ON "OAuthToken"("refreshToken");

-- CreateIndex
CREATE INDEX "idx_oauthscope_name" ON "OAuthScope"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_OAuthClientToOAuthScope_AB_unique" ON "_OAuthClientToOAuthScope"("A", "B");

-- CreateIndex
CREATE INDEX "_OAuthClientToOAuthScope_B_index" ON "_OAuthClientToOAuthScope"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_OAuthAuthCodeToOAuthScope_AB_unique" ON "_OAuthAuthCodeToOAuthScope"("A", "B");

-- CreateIndex
CREATE INDEX "_OAuthAuthCodeToOAuthScope_B_index" ON "_OAuthAuthCodeToOAuthScope"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_OAuthScopeToOAuthToken_AB_unique" ON "_OAuthScopeToOAuthToken"("A", "B");

-- CreateIndex
CREATE INDEX "_OAuthScopeToOAuthToken_B_index" ON "_OAuthScopeToOAuthToken"("B");

-- AddForeignKey
ALTER TABLE "oauthClient_oauthScope" ADD CONSTRAINT "oauthClient_oauthScope_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthClient_oauthScope" ADD CONSTRAINT "oauthClient_oauthScope_scopeId_fkey" FOREIGN KEY ("scopeId") REFERENCES "OAuthScope"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthCode" ADD CONSTRAINT "OAuthAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthCode" ADD CONSTRAINT "OAuthAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OAuthClientToOAuthScope" ADD CONSTRAINT "_OAuthClientToOAuthScope_A_fkey" FOREIGN KEY ("A") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OAuthClientToOAuthScope" ADD CONSTRAINT "_OAuthClientToOAuthScope_B_fkey" FOREIGN KEY ("B") REFERENCES "OAuthScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OAuthAuthCodeToOAuthScope" ADD CONSTRAINT "_OAuthAuthCodeToOAuthScope_A_fkey" FOREIGN KEY ("A") REFERENCES "OAuthAuthCode"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OAuthAuthCodeToOAuthScope" ADD CONSTRAINT "_OAuthAuthCodeToOAuthScope_B_fkey" FOREIGN KEY ("B") REFERENCES "OAuthScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OAuthScopeToOAuthToken" ADD CONSTRAINT "_OAuthScopeToOAuthToken_A_fkey" FOREIGN KEY ("A") REFERENCES "OAuthScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OAuthScopeToOAuthToken" ADD CONSTRAINT "_OAuthScopeToOAuthToken_B_fkey" FOREIGN KEY ("B") REFERENCES "OAuthToken"("accessToken") ON DELETE CASCADE ON UPDATE CASCADE;
