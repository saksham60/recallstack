import { LocalStorageSystemDesignRepository } from "./LocalStorageSystemDesignRepository";
import type { SystemDesignRepository } from "./SystemDesignRepository";

export function createSystemDesignRepository(
  storage?: Storage,
): SystemDesignRepository {
  return new LocalStorageSystemDesignRepository(storage);
}
