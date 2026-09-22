import { NextResponse } from 'next/server';
import { verifyDeterminism, receiptArtifact } from '@/services/determinism';

export const dynamic = 'force-dynamic';

/**
 * Determinism receipt: replay every screening from the master seed and
 * byte-compare the watch-event streams. Read-only, idempotent, zero AI spend.
 * GET = easy curl proof for judges, POST = explicit action from the UI.
 * `?download=1` returns a portable, HMAC-signed JSON artifact.
 */
async function handle(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const receipt = await verifyDeterminism(id);
    const download = new URL(req.url).searchParams.get('download');
    if (download) {
      const artifact = receiptArtifact(receipt);
      const slug = receipt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'show';
      const body = JSON.stringify(artifact, null, 2);
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="sweeps-receipt-${slug}-${receipt.fingerprint.slice(0, 8)}.json"`,
        },
      });
    }
    return NextResponse.json({ receipt });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'verification failed' },
      { status: 400 }
    );
  }
}

export const GET = handle;
export const POST = handle;
