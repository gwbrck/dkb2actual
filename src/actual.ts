import * as actualApi from "@actual-app/api";
import type { Config } from "./config.js";
import type { ActualTransaction } from "./dkb.js";

// Cast to any to access methods not in the type definitions
const api = actualApi as any;

/**
 * Initialise the Actual API (only once per process).
 */
export async function init(config: Config): Promise<void> {
  await actualApi.init({
    dataDir: config.dataDir,
    serverURL: config.serverURL,
    password: config.password,
  });
}

/**
 * Download and open a specific budget by its sync-ID.
 * Can be called multiple times to switch between budgets.
 * Syncs after loading so the local cache is always up to date,
 * even if the budget was modified elsewhere since the last run.
 */
export async function connectToBudget(syncId: string): Promise<void> {
  await api.downloadBudget(syncId);
  await api.sync();
  console.log(`  Budget geladen und synchronisiert: ${syncId}`);
}

/**
 * Find the internal Actual account UUID by name (case-insensitive).
 */
export async function getActualAccountId(name: string): Promise<string> {
  const accounts: { id: string; name: string }[] = await api.getAccounts();
  const match = accounts.find(
    (a) => a.name.toLowerCase() === name.toLowerCase(),
  );
  if (!match) {
    const available = accounts.map((a) => `"${a.name}"`).join(", ");
    throw new Error(
      `Konto "${name}" nicht in Actual Budget gefunden. Verfügbare Konten: ${available}`,
    );
  }
  return match.id;
}

/**
 * Import transactions into a specific Actual Budget account.
 * Uses importTransactions which handles deduplication via imported_id.
 */
export async function importToAccount(
  accountId: string,
  transactions: ActualTransaction[],
): Promise<{ added: string[]; updated: string[] }> {
  const result = await api.importTransactions(accountId, transactions);

  if (result.errors && result.errors.length > 0) {
    console.error("Import errors:", result.errors);
  }

  return {
    added: result.added ?? [],
    updated: result.updated ?? [],
  };
}

/**
 * Sync the current budget back to the server.
 */
export async function syncBudget(): Promise<void> {
  await api.sync();
}

/**
 * Shut down the Actual API entirely.
 */
export async function shutdown(): Promise<void> {
  await actualApi.shutdown();
  console.log("Actual Budget API beendet.");
}
