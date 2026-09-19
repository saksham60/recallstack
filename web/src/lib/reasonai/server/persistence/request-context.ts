import "server-only";
import { cookies } from "next/headers";
import { isE2EAuthBypassEnabled } from "@/lib/config/server";
import { authenticateApiRequestWithContext } from "@/lib/supabase/api-auth";
import { MemoryReasonAIPersistenceRepository } from "./memory-repository";
import { SupabaseReasonAIPersistenceRepository } from "./supabase-repository";
import type { ReasonAIPersistenceRepository } from "./types";

export interface ReasonAIPersistenceRequestContext {
  userId: string;
  repository: ReasonAIPersistenceRepository;
}

const E2E_USER_ID = "00000000-0000-4000-8000-000000000001";
const e2eRepository = new MemoryReasonAIPersistenceRepository();

export async function getReasonAIPersistenceRequestContext(
  request: Request,
): Promise<ReasonAIPersistenceRequestContext | Response> {
  if (isE2EAuthBypassEnabled() && (await cookies()).has("e2e-bypass-auth")) {
    return { userId: E2E_USER_ID, repository: e2eRepository };
  }
  const authenticated = await authenticateApiRequestWithContext(request);
  if (authenticated instanceof Response) return authenticated;
  return {
    userId: authenticated.user.id,
    repository: new SupabaseReasonAIPersistenceRepository(authenticated.supabase),
  };
}

