import "dotenv/config";

export interface DkbAccount {
  /** Display name for logging — must match the account name in Actual Budget exactly (case-insensitive) */
  name: string;
  /** IBAN used to find the DKB CSV export file */
  iban: string;
  /** Sync-ID of the Actual Budget this account belongs to */
  syncId: string;
}

export interface Config {
  serverURL: string;
  password: string;
  dataDir: string;
  accounts: DkbAccount[];
  /** All own IBANs: from ACCOUNT_X_IBAN + OWN_IBANS */
  ownIbans: string[];
}

function loadAccounts(): DkbAccount[] {
  const accounts: DkbAccount[] = [];

  for (let i = 0; ; i++) {
    const name = process.env[`ACCOUNT_${i}_NAME`];
    const iban = process.env[`ACCOUNT_${i}_IBAN`];
    const syncId = process.env[`ACCOUNT_${i}_SYNC_ID`];

    if (!name && !iban && !syncId) break;

    const missing = [
      !name && `ACCOUNT_${i}_NAME`,
      !iban && `ACCOUNT_${i}_IBAN`,
      !syncId && `ACCOUNT_${i}_SYNC_ID`,
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(`Incomplete account config, missing: ${missing.join(", ")}`);
    }

    accounts.push({ name: name!, iban: iban!, syncId: syncId! });
  }

  if (accounts.length === 0) {
    throw new Error(
      "No accounts configured. Add ACCOUNT_0_NAME, ACCOUNT_0_IBAN, ACCOUNT_0_SYNC_ID to .env",
    );
  }

  return accounts;
}

export function loadConfig(): Config {
  const serverURL = process.env.ACTUAL_SERVER_URL;
  const password = process.env.ACTUAL_PASSWORD;

  if (!serverURL || !password) {
    const missing = [
      !serverURL && "ACTUAL_SERVER_URL",
      !password && "ACTUAL_PASSWORD",
    ].filter(Boolean);
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const accounts = loadAccounts();

  const extraIbans = (process.env.OWN_IBANS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ownIbans = [...new Set([...accounts.map((a) => a.iban), ...extraIbans])];

  return {
    serverURL,
    password,
    dataDir: process.env.ACTUAL_DATA_DIR ?? "./cache",
    accounts,
    ownIbans,
  };
}
