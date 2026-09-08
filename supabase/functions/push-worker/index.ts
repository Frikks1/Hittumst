import { createClient } from "npm:@supabase/supabase-js@2.57.4";

import { handleOptions, jsonResponse } from "../_shared/http.ts";
import { normalizeClaim, privatePushMessages } from "./payload.ts";

type UnknownRecord = Record<string, unknown>;

interface RpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function items(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = record(value);
  for (const key of ["items", "data", "outbox", "deliveries", "receipts"]) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function secretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    const keys = JSON.parse(modern) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  return requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function validWorkerSecret(request: Request) {
  const supplied = request.headers.get("x-worker-secret") ?? "";
  const expected = requiredEnv("PUSH_WORKER_SECRET");
  return supplied.length > 0 &&
    await digest(supplied) === await digest(expected);
}

function expoHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

async function processOutbox(supabase: RpcClient) {
  const claimToken = crypto.randomUUID();
  const { data, error } = await supabase.rpc("claim_notification_outbox", {
    batch_size: 25,
    claim_token: claimToken,
  });
  if (error) throw error;
  const claimed = normalizeClaim(data);
  let deliveries = 0;

  for (const outbox of claimed) {
    if (outbox.tokens.length === 0) {
      const { error: recordError } = await supabase.rpc("record_push_tickets", {
        outbox_id: outbox.id,
        claim_token: claimToken,
        tickets: [],
      });
      if (recordError) throw recordError;
      continue;
    }

    const messages = privatePushMessages(outbox);
    let tickets: Array<Record<string, unknown>>;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Expo HTTP ${response.status}`);
      const payload = await response.json() as { data?: unknown };
      const responseTickets = Array.isArray(payload.data)
        ? payload.data
        : [payload.data];
      tickets = outbox.tokens.slice(0, messages.length).map((token, index) => {
        const ticket = record(responseTickets[index]);
        return {
          tokenId: token.id,
          ticketId: string(ticket.id) || null,
          status: string(ticket.status) || "error",
          error: string(record(ticket.details).error ?? ticket.message) || null,
        };
      });
    } catch (error) {
      tickets = outbox.tokens.slice(0, messages.length).map((token) => ({
        tokenId: token.id,
        ticketId: null,
        status: "error",
        error: error instanceof Error ? error.message : "Expo request failed",
      }));
    }

    const { error: recordError } = await supabase.rpc("record_push_tickets", {
      outbox_id: outbox.id,
      claim_token: claimToken,
      tickets,
    });
    if (recordError) throw recordError;
    deliveries += tickets.length;
  }
  return { outbox: claimed.length, deliveries };
}

async function processReceipts(supabase: RpcClient) {
  const { data, error } = await supabase.rpc("list_pending_push_receipts", {
    limit_count: 500,
  });
  if (error) throw error;
  const pending = items(data).flatMap((candidate) => {
    const row = record(candidate);
    const ticketId = string(
      row.ticket_id ?? row.ticketId ?? row.provider_ticket_id,
    );
    return ticketId ? [{ ticketId }] : [];
  });
  if (pending.length === 0) return { requested: 0, received: 0 };

  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify({ ids: pending.map((entry) => entry.ticketId) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Expo receipt HTTP ${response.status}`);
  const payload = await response.json() as { data?: UnknownRecord };
  const receiptMap = record(payload.data);
  const receipts = Object.entries(receiptMap).map(([ticketId, value]) => {
    const receipt = record(value);
    return {
      ticketId,
      status: string(receipt.status) || "error",
      error: string(record(receipt.details).error ?? receipt.message) || null,
      details: record(receipt.details),
    };
  });
  if (receipts.length > 0) {
    const { error: recordError } = await supabase.rpc("record_push_receipts", {
      receipts,
    });
    if (recordError) throw recordError;
  }
  return { requested: pending.length, received: receipts.length };
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!await validWorkerSecret(request)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let requestedMode = "";
  try {
    const body = record(await request.json());
    requestedMode = string(body.mode);
  } catch {
    // Empty bodies run both bounded phases.
  }

  const mode: "send" | "receipts" | "all" = requestedMode === "send" ||
      requestedMode === "receipts"
    ? requestedMode
    : "all";

  const supabase = createClient(requiredEnv("SUPABASE_URL"), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as RpcClient;
  try {
    const sent = mode === "receipts"
      ? undefined
      : await processOutbox(supabase);
    const receipts = mode === "send"
      ? undefined
      : await processReceipts(supabase);
    return jsonResponse({ ok: true, sent, receipts });
  } catch {
    return jsonResponse({
      error: "Push processing failed",
    }, 500);
  }
});
