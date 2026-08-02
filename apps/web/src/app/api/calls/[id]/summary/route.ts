import { NextResponse } from 'next/server';
import { prisma } from '@rvagent/db';

export const dynamic = 'force-dynamic';

/**
 * `GET /api/calls/:id/summary`
 *
 * The structured summary, exactly as validated by the zod schema, plus the
 * bilingual narrative. This is the endpoint a CRM integration would consume.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const summary = await prisma.summary.findUnique({
    where: { callId: id },
    include: {
      call: {
        select: {
          id: true,
          startedAt: true,
          endedAt: true,
          durationSec: true,
          outcome: true,
          transport: true,
          primaryLanguage: true,
          languageMix: true,
          providerSet: true,
          lead: { select: { id: true, name: true, phone: true, status: true, score: true } },
        },
      },
    },
  });

  if (!summary) {
    return NextResponse.json(
      { error: 'No summary for that call. It may still be in progress.' },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      callId: summary.callId,
      call: summary.call,
      generatedBy: summary.generatedBy,
      generatedAt: summary.createdAt,
      qualificationScore: summary.qualificationScore,
      leadTemperature: summary.leadTemperature,
      sentiment: summary.sentiment,
      nextAction: summary.nextAction,
      suggestedFollowUpDate: summary.suggestedFollowUpDate,
      structured: summary.structured,
      narrative: { en: summary.textEn, hi: summary.textHi },
    },
    {
      headers: {
        'content-disposition': `inline; filename="call-${id}-summary.json"`,
      },
    },
  );
}
