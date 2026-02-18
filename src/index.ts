import { loadConfig } from "./config.js";
import { findDkbFile, parseDkbCsv, transformToActualTransactions } from "./dkb.js";
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
        console.log(`\n--- ${account.name} (${account.iban}) ---`);

        const filePath = findDkbFile(account.iban);
        if (!filePath) {
          console.log("  Keine CSV-Datei in ~/Downloads gefunden. Überspringe.");
          continue;
        }
        console.log(`  Gefunden: ${filePath}`);

        const rows = parseDkbCsv(filePath);
        console.log(`  ${rows.length} Zeilen geparst.`);

        if (rows.length === 0) {
          console.log("  Keine Transaktionen. Überspringe.");
          continue;
        }

        const actualAccountId = await getActualAccountId(account.name);
        console.log(`  Actual-Konto-ID: ${actualAccountId}`);

        const transactions = transformToActualTransactions(rows, actualAccountId, config.ownIbans);
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
