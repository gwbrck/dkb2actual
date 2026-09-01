import "dotenv/config";

interface BaseAccount {
  /** Display name for logging — must match the account name in Actual Budget exactly (case-insensitive) */
  name: string;
  /** Sync-ID of the Actual Budget this account belongs to */
  syncId: string;
}

export interface DkbAccount extends BaseAccount {
  type: "dkb";
  /** IBAN used to find the DKB CSV export file */
  iban: string;
}

export interface TradeRepublicAccount extends BaseAccount {
  type: "traderepublic";
}

export type Account = DkbAccount | TradeRepublicAccount;

export interface Config {
  serverURL: string;
  password: string;
  dataDir: string;
  accounts: Account[];
  /** All own IBANs: from ACCOUNT_X_IBAN + OWN_IBANS */
  ownIbans: string[];
}

function loadAccounts(): Account[] {
  const accounts: Account[] = [];

  for (let i = 0; ; i++) {
    const name = process.env[`ACCOUNT_${i}_NAME`];
    const iban = process.env[`ACCOUNT_${i}_IBAN`];
    const syncId = process.env[`ACCOUNT_${i}_SYNC_ID`];
    const type = (process.env[`ACCOUNT_${i}_TYPE`] ?? "dkb").toLowerCase();

    if (!name && !iban && !syncId) break;

    const missing = [
      !name && `ACCOUNT_${i}_NAME`,
      !syncId && `ACCOUNT_${i}_SYNC_ID`,
      type === "dkb" && !iban && `ACCOUNT_${i}_IBAN`,
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(`Incomplete account config, missing: ${missing.join(", ")}`);
    }

    if (type === "dkb") {
      accounts.push({ type, name: name!, iban: iban!, syncId: syncId! });
    } else if (type === "traderepublic") {
      accounts.push({ type, name: name!, syncId: syncId! });
    } else {
      throw new Error(
        `Unsupported account type in ACCOUNT_${i}_TYPE: "${type}". Use "dkb" or "traderepublic".`,
      );
    }
  }

  if (accounts.length === 0) {
    throw new Error(
      "No accounts configured. Add an ACCOUNT_0 block to .env; see .env.example.",
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

  const ownIbans = [
    ...new Set([
      ...accounts.filter((account): account is DkbAccount => account.type === "dkb").map((account) => account.iban),
      ...extraIbans,
    ]),
  ];

  return {
    serverURL,
    password,
    dataDir: process.env.ACTUAL_DATA_DIR ?? "./cache",
    accounts,
    ownIbans,
  };
}
