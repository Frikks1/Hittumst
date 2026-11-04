import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function removed() { return NextResponse.json({ error: 'money_features_removed' }, { status: 410 }); }
export const GET = removed;
export const POST = removed;
export const OPTIONS = removed;
