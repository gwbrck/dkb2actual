import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import type { ActualTransaction } from "./dkb.js";

export interface TradeRepublicRawRow {
  datetime: string;
  date: string;
  account_type: string;
  category: string;
  type: string;
  asset_class: string;
  name: string;
  symbol: string;
  shares: string;
  price: string;
  amount: string;
  fee: string;
  tax: string;
  currency: string;
  original_amount: string;
  original_currency: string;
  fx_rate: string;
  description: string;
  transaction_id: string;
  counterparty_name: string;
  counterparty_iban: string;
  payment_reference: string;
  mcc_code: string;
}

export function findTradeRepublicFile(): string | null {
  const filePath = join(homedir(), "Downloads", "Transaktionsexport.csv");
  return existsSync(filePath) ? filePath : null;
}

export function parseTradeRepublicCsv(filePath: string): TradeRepublicRawRow[] {
  const content = readFileSync(filePath, "utf-8");
  return parse(content, {
    bom: true,
    columns: true,
    delimiter: ",",
    skip_empty_lines: true,
    trim: true,
  });
}

function fallbackImportedId(row: TradeRepublicRawRow): string {
  const raw = `${row.datetime}|${row.amount}|${row.currency}|${row.type}|${row.name}|${row.description}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function getPayeeName(row: TradeRepublicRawRow): string {
  const providedName = row.counterparty_name || row.name;
  if (providedName) return providedName.trim();

  const readableType = row.type.toLowerCase().replaceAll("_", " ");
  return readableType ? `Trade Republic - ${readableType}` : "Trade Republic";
}

export function transformTradeRepublicTransactions(
  rows: TradeRepublicRawRow[],
  actualAccountId: string,
  ownIbans: string[] = [],
): ActualTransaction[] {
  const normalizedOwnIbans = new Set(ownIbans.map((iban) => iban.replaceAll(" ", "").toUpperCase()));

  return rows.flatMap((row) => {
    if (!row.date || !row.amount) return [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      throw new Error(`Cannot parse Trade Republic date: "${row.date}"`);
    }

    const amountParts = [row.amount, row.fee || "0", row.tax || "0"].map(Number);
    if (amountParts.some((value) => !Number.isFinite(value))) {
      throw new Error(
        `Cannot parse Trade Republic amount, fee or tax: "${row.amount}", "${row.fee}", "${row.tax}"`,
      );
    }
    const amount = amountParts.reduce((sum, value) => sum + value, 0);

    const counterpartIban = row.counterparty_iban.replaceAll(" ", "").toUpperCase();
    const payeeName = counterpartIban && normalizedOwnIbans.has(counterpartIban)
      ? counterpartIban
      : getPayeeName(row);

    return [{
      account: actualAccountId,
      date: row.date,
      amount: Math.round(amount * 100),
      payee_name: payeeName,
      imported_payee: payeeName,
      notes: row.description || row.payment_reference || "",
      imported_id: row.transaction_id || fallbackImportedId(row),
      cleared: true,
    }];
  });
}
