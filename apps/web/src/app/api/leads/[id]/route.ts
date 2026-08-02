import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalisePhone, prisma, updateLead } from '@rvagent/db';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  phone: z.string().max(24).nullable().optional(),
  email: z.string().email().max(200).nullable().optional().or(z.literal('')),
  location: z.string().max(120).nullable().optional(),
  configuration: z.string().max(24).nullable().optional(),
  budgetMin: z.number().int().nonnegative().nullable().optional(),
  budgetMax: z.number().int().nonnegative().nullable().optional(),
  status: z
    .enum([
      'new_lead',
      'qualified',
      'unqualified',
      'callback_scheduled',
      'site_visit_scheduled',
      'do_not_call',
      'closed_lost',
    ])
    .optional(),
  notes: z.string().max(4_000).nullable().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid lead payload.', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

  const { phone, email, ...rest } = parsed.data;

  try {
    const lead = await updateLead(id, {
      ...rest,
      ...(phone !== undefined ? { phone: normalisePhone(phone) } : {}),
      ...(email !== undefined ? { email: email === '' ? null : email } : {}),
    });
    return NextResponse.json({ lead });
  } catch (error) {
    // The most likely failure is the unique phone constraint, which is worth
    // reporting precisely rather than as a generic 500.
    const message = error instanceof Error ? error.message : 'Update failed.';
    const isDuplicate = message.includes('Unique constraint');
    return NextResponse.json(
      { error: isDuplicate ? 'Another lead already has that phone number.' : 'Could not update the lead.' },
      { status: isDuplicate ? 409 : 500 },
    );
  }
}
