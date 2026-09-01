import { loadConfig } from "./config.js";
import {
  findDkbFile,
  parseDkbCsv,
  transformToActualTransactions,
  type ActualTransaction,
} from "./dkb.js";
import {
  findTradeRepublicFile,
  parseTradeRepublicCsv,
  transformTradeRepublicTransactions,
} from "./traderepublic.js";
import { init, connectToBudget, getActualAccountId, importToAccount, syncBudget, shutdown } from "./actual.js";

async function main() {
  const config = loadConfig();

  await init(config);

  // Group accounts by syncId so we only connect to each budget once
  const byBudget = new Map<string, typeof config.accounts>();
  for (const account of config.accounts) {
    const group = byBudget.get(account.syncId) ?? [];
    group.push(account);
    byBudget.set(account.syncId, group);
  }

  try {
    for (const [syncId, accounts] of byBudget) {
      console.log(`\n=== Budget: ${syncId} ===`);
      await connectToBudget(syncId);

      for (const account of accounts) {
        const accountDetails = account.type === "dkb" ? ` (${account.iban})` : " (Trade Republic)";
        console.log(`\n--- ${account.name}${accountDetails} ---`);

        const filePath = account.type === "dkb"
          ? findDkbFile(account.iban)
          : findTradeRepublicFile();
        if (!filePath) {
          const expectedFile = account.type === "dkb" ? "DKB-CSV-Datei" : "Transaktionsexport.csv";
          console.log(`  Keine ${expectedFile} in ~/Downloads gefunden. Überspringe.`);
          continue;
        }
        console.log(`  Gefunden: ${filePath}`);

        let rowCount: number;
        let transform: (accountId: string) => ActualTransaction[];
        if (account.type === "dkb") {
          const rows = parseDkbCsv(filePath);
          rowCount = rows.length;
          transform = (accountId) => transformToActualTransactions(rows, accountId, config.ownIbans);
        } else {
          const rows = parseTradeRepublicCsv(filePath);
          rowCount = rows.length;
          transform = (accountId) => transformTradeRepublicTransactions(rows, accountId, config.ownIbans);
        }
        console.log(`  ${rowCount} Zeilen geparst.`);

        if (rowCount === 0) {
          console.log("  Keine Transaktionen. Überspringe.");
          continue;
        }

        const actualAccountId = await getActualAccountId(account.name);
        console.log(`  Actual-Konto-ID: ${actualAccountId}`);

        const transactions = transform(actualAccountId);
        console.log(`  ${transactions.length} Transaktionen transformiert.`);

        const result = await importToAccount(actualAccountId, transactions);
        console.log(`  Importiert: ${result.added.length} neu, ${result.updated.length} aktualisiert.`);
      }

      await syncBudget();
      console.log(`  Budget synchronisiert.`);
    }
  } finally {
    await shutdown();
  }

  console.log("\nFertig.");
}

main().catch((err) => {
  console.error("Fataler Fehler:", err);
  process.exit(1);
});
