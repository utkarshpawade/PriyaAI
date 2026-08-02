-- CreateEnum
CREATE TYPE "CallTransport" AS ENUM ('web', 'phone');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('in_progress', 'qualified', 'not_interested', 'callback_requested', 'wrong_number', 'abandoned');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new_lead', 'qualified', 'unqualified', 'callback_scheduled', 'site_visit_scheduled', 'do_not_call', 'closed_lost');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('hot', 'warm', 'cold');

-- CreateEnum
CREATE TYPE "TurnRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "SiteVisitStatus" AS ENUM ('requested', 'confirmed', 'cancelled', 'completed');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "intent" TEXT,
    "location" TEXT,
    "propertyType" TEXT,
    "configuration" TEXT,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "purpose" TEXT,
    "timeline" TEXT,
    "financing" TEXT,
    "preferredCallbackTime" TEXT,
    "objections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "LeadStatus" NOT NULL DEFAULT 'new_lead',
    "score" INTEGER NOT NULL DEFAULT 0,
    "temperature" "LeadTemperature",
    "source" TEXT NOT NULL DEFAULT 'voice_agent',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "transport" "CallTransport" NOT NULL DEFAULT 'web',
    "direction" "CallDirection" NOT NULL DEFAULT 'inbound',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "languageMode" TEXT NOT NULL DEFAULT 'auto',
    "primaryLanguage" TEXT,
    "languageMix" JSONB,
    "outcome" "CallOutcome" NOT NULL DEFAULT 'in_progress',
    "recordingUrl" TEXT,
    "providerSet" JSONB NOT NULL,
    "agentConfigId" INTEGER,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "twilioCallSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "role" "TurnRole" NOT NULL,
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "interrupted" BOOLEAN NOT NULL DEFAULT false,
    "audioUrl" TEXT,
    "toolCalls" JSONB,
    "sttMs" INTEGER,
    "llmFirstTokenMs" INTEGER,
    "ttsFirstByteMs" INTEGER,
    "totalMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Summary" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "structured" JSONB NOT NULL,
    "textEn" TEXT NOT NULL,
    "textHi" TEXT NOT NULL,
    "qualificationScore" INTEGER NOT NULL,
    "leadTemperature" "LeadTemperature" NOT NULL,
    "sentiment" TEXT NOT NULL,
    "nextAction" TEXT NOT NULL,
    "suggestedFollowUpDate" TIMESTAMP(3),
    "generatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Summary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "callId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "dateHint" TEXT NOT NULL,
    "projectSlug" TEXT NOT NULL,
    "status" "SiteVisitStatus" NOT NULL DEFAULT 'requested',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'outside_knowledge_base',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "greetingHinglish" TEXT NOT NULL,
    "greetingHindi" TEXT NOT NULL,
    "greetingEnglish" TEXT NOT NULL,
    "persona" TEXT NOT NULL,
    "guardrails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slotOrder" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "kbOverrides" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phone_key" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_twilioCallSid_key" ON "Call"("twilioCallSid");

-- CreateIndex
CREATE INDEX "Call_startedAt_idx" ON "Call"("startedAt");

-- CreateIndex
CREATE INDEX "Call_outcome_idx" ON "Call"("outcome");

-- CreateIndex
CREATE INDEX "Turn_callId_idx" ON "Turn"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_callId_index_key" ON "Turn"("callId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Summary_callId_key" ON "Summary"("callId");

-- CreateIndex
CREATE INDEX "SiteVisit_scheduledFor_idx" ON "SiteVisit"("scheduledFor");

-- CreateIndex
CREATE INDEX "FollowUp_callId_idx" ON "FollowUp"("callId");

-- CreateIndex
CREATE INDEX "AgentConfig_isActive_idx" ON "AgentConfig"("isActive");

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES "AgentConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Summary" ADD CONSTRAINT "Summary_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;
