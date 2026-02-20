import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";

// ── Types ──

/** Raw row as parsed from the DKB CSV (after skipping the 4 header rows). */
interface DkbRawRow {
  Buchungsdatum: string;
  Wertstellung: string;
  Status: string;
  "Zahlungspflichtige*r": string;
  "Zahlungsempfänger*in": string;
  Verwendungszweck: string;
  Umsatztyp: string;
  IBAN: string;
  "Betrag (€)": string;
  "Gläubiger-ID": string;
  Mandatsreferenz: string;
  Kundenreferenz: string;
}

/** Transaction in the format expected by Actual Budget's importTransactions. */
export interface ActualTransaction {
  account: string;
  date: string;
  amount: number;
  payee_name: string;
  imported_payee: string;
  notes: string;
  imported_id: string;
  cleared: boolean;
}

// ── File Discovery ──

/**
 * Find the DKB CSV export file in ~/Downloads for the given IBAN and date.
 * DKB names files like: {dd-mm-yyyy}_Umsatzliste_Girokonto_{IBAN}.csv
 */
export function findDkbFile(iban: string, date?: Date): string | null {
  const d = date ?? new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  const downloads = join(homedir(), "Downloads");

  const patterns = [
    `${dateStr}_Umsatzliste_Girokonto_${iban}.csv`,
    `${dateStr}_Umsatzliste_Tagesgeld_${iban}.csv`,
  ];

  for (const filename of patterns) {
    const filePath = join(downloads, filename);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

// ── CSV Parsing ──

/**
 * Parse a German decimal string (e.g. "1.234,56") into a float.
 */
function parseGermanDecimal(value: string): number {
  // Remove thousands separator (.), replace decimal comma with dot
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  if (isNaN(num)) {
    throw new Error(`Cannot parse amount: "${value}"`);
  }
  return num;
}

/**
 * Parse a German date string (dd.mm.yy) into YYYY-MM-DD.
 */
function parseGermanDate(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) {
    throw new Error(`Cannot parse date: "${value}"`);
  }
  const [dd, mm, yy] = parts;
  // Assume 2000s for 2-digit years
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Convert a currency float (e.g. -12.50) to Actual Budget's integer format (e.g. -1250).
 */
function amountToInteger(value: number): number {
  return Math.round(value * 100);
}

/**
 * Generate a deterministic imported_id for deduplication.
 */
function generateImportedId(date: string, amount: number, payee: string, notes: string): string {
  const raw = `${date}|${amount}|${payee}|${notes}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Read and parse a DKB CSV export file.
 * DKB CSVs have 4 metadata header rows before the actual column headers.
 */
export function parseDkbCsv(filePath: string): DkbRawRow[] {
  const content = readFileSync(filePath, "utf-8");

  // Skip the first 4 lines (DKB metadata rows)
  const lines = content.split("\n");
  const csvWithoutHeader = lines.slice(4).join("\n");

  const rows: DkbRawRow[] = parse(csvWithoutHeader, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    relax_column_count: true,
  });

  return rows;
}

// ── Transformation ──

/**
 * Determine the opposing party name from a DKB row.
 * If the amount is negative (outgoing), payee = Zahlungsempfänger*in.
 * If the amount is positive (incoming), payee = Zahlungspflichtige*r.
 */
function getOpposingName(row: DkbRawRow, amount: number): string {
  if (amount < 0) {
    return row["Zahlungsempfänger*in"] || row["Zahlungspflichtige*r"] || "";
  }
  return row["Zahlungspflichtige*r"] || row["Zahlungsempfänger*in"] || "";
}

/**
 * Transform parsed DKB rows into Actual Budget transactions.
 * ownIbans: list of IBANs from .env — if the counterpart IBAN matches one of
 * these, use the IBAN as payee_name instead of the bank-provided name.
 */
export function transformToActualTransactions(
  rows: DkbRawRow[],
  actualAccountId: string,
  ownIbans: string[] = [],
): ActualTransaction[] {
  const transactions: ActualTransaction[] = [];

  for (const row of rows) {
    const amountRaw = row["Betrag (€)"];
    if (!amountRaw || !row.Buchungsdatum) continue;

    const amountFloat = parseGermanDecimal(amountRaw);
    const amount = amountToInteger(amountFloat);
    const date = parseGermanDate(row.Buchungsdatum);
    const notes = row.Verwendungszweck || "";
    const counterpartIban = row.IBAN?.trim() ?? "";
    const isOwnAccount = counterpartIban !== "" && ownIbans.includes(counterpartIban);
    const payeeName = isOwnAccount ? counterpartIban.toUpperCase() : getOpposingName(row, amountFloat);


    // Build a raw description for imported_payee (what the bank originally shows)
    const importedPayee = counterpartIban 
    ? `${payeeName} (${counterpartIban})` 
    : payeeName;

    transactions.push({
      account: actualAccountId,
      date,
      amount,
      payee_name: payeeName.trim(),
      imported_payee: importedPayee.trim(),
      notes,
      imported_id: generateImportedId(date, amount, payeeName, notes, row.Kundenreferenz?.trim() ?? ""),
      cleared: true,
    });
  }

  return transactions;
}
