import { operationsHealth } from '@/lib/operations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const result = operationsHealth(process.env, request.headers.get('authorization'));
  return Response.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
