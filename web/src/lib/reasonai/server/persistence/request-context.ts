import "server-only";
import { cookies } from "next/headers";
import { isE2EAuthBypassEnabled } from "@/lib/config/server";
import { authenticateApiRequestWithContext } from "@/lib/supabase/api-auth";
import { MemoryReasonAIPersistenceRepository } from "./memory-repository";
import { SupabaseReasonAIPersistenceRepository } from "./supabase-repository";
import type { ReasonAIPersistenceRepository } from "./types";
import { MemoryLearnerMemoryRepository } from "../memory/memory-repository";
import { SupabaseLearnerMemoryRepository } from "../memory/supabase-repository";
import type { LearnerMemoryRepository } from "../memory/types";

export interface ReasonAIPersistenceRequestContext {
  userId: string;
  repository: ReasonAIPersistenceRepository;
  learnerMemoryRepository: LearnerMemoryRepository;
  testMode: boolean;
}

const E2E_USER_ID = "00000000-0000-4000-8000-000000000001";
type E2ERepositories = {
  repository: MemoryReasonAIPersistenceRepository;
  learnerMemoryRepository: MemoryLearnerMemoryRepository;
};
function developmentRepositories(): E2ERepositories {
  // Dev route bundles/HMR can instantiate this module more than once. Only the
  // existing development-only E2E bypass uses this shared fixture; production
  // always creates user-scoped Supabase adapters below.
  const scope = globalThis as typeof globalThis & { __reasonaiE2ERepositoriesV1?: E2ERepositories };
  return scope.__reasonaiE2ERepositoriesV1 ??= {
    repository: new MemoryReasonAIPersistenceRepository(),
    learnerMemoryRepository: new MemoryLearnerMemoryRepository(),
  };
}

export async function getReasonAIPersistenceRequestContext(
  request: Request,
): Promise<ReasonAIPersistenceRequestContext | Response> {
  if (isE2EAuthBypassEnabled() && (await cookies()).has("e2e-bypass-auth")) {
    return { userId: E2E_USER_ID, ...developmentRepositories(), testMode: true };
  }
  const authenticated = await authenticateApiRequestWithContext(request);
  if (authenticated instanceof Response) return authenticated;
  return {
    userId: authenticated.user.id,
    repository: new SupabaseReasonAIPersistenceRepository(authenticated.supabase),
    learnerMemoryRepository: new SupabaseLearnerMemoryRepository(authenticated.supabase),
    testMode: false,
  };
}
