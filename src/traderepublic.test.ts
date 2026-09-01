import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  parseTradeRepublicCsv,
  transformTradeRepublicTransactions,
} from "./traderepublic.js";

const header = [
  "datetime",
  "date",
  "account_type",
  "category",
  "type",
  "asset_class",
  "name",
  "symbol",
  "shares",
  "price",
  "amount",
  "fee",
  "tax",
  "currency",
  "original_amount",
  "original_currency",
  "fx_rate",
  "description",
  "transaction_id",
  "counterparty_name",
  "counterparty_iban",
  "payment_reference",
  "mcc_code",
].join(",");

test("parses and transforms Trade Republic cash and trading rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "traderepublic-test-"));
  const filePath = join(directory, "Transaktionsexport.csv");
  const rows = [
    '"2026-08-17T09:05:58.813Z","2026-08-17","DEFAULT","CASH","CARD_TRANSACTION","","Lidl","","","","-8.970000","","","EUR","","","","TR Card Transaction","card-id","","","","5411"',
    '"2026-08-17T14:44:35.582Z","2026-08-17","DEFAULT","TRADING","BUY","FUND","Global ETF","IE0000000001","1.5","40.00","-60.00","-1.00","","EUR","","","","Savings plan execution","buy-id","","","",""',
    '"2026-08-18T02:09:36.636Z","2026-08-18","DEFAULT","CASH","TRANSFER_INBOUND","","Gregor","","","","120.00","","","EUR","","","","Incoming transfer","transfer-id","Gregor","DE00 1234","",""',
  ];
  writeFileSync(filePath, `${header}\n${rows.join("\n")}\n`);

  try {
    const parsed = parseTradeRepublicCsv(filePath);
    const transactions = transformTradeRepublicTransactions(parsed, "actual-account", ["DE001234"]);

    assert.equal(parsed.length, 3);
    assert.deepEqual(transactions, [
      {
        account: "actual-account",
        date: "2026-08-17",
        amount: -897,
        payee_name: "Lidl",
        imported_payee: "Lidl",
        notes: "TR Card Transaction",
        imported_id: "card-id",
        cleared: true,
      },
      {
        account: "actual-account",
        date: "2026-08-17",
        amount: -6100,
        payee_name: "Global ETF",
        imported_payee: "Global ETF",
        notes: "Savings plan execution",
        imported_id: "buy-id",
        cleared: true,
      },
      {
        account: "actual-account",
        date: "2026-08-18",
        amount: 12000,
        payee_name: "DE001234",
        imported_payee: "DE001234",
        notes: "Incoming transfer",
        imported_id: "transfer-id",
        cleared: true,
      },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("uses a stable fallback payee and imported ID", () => {
  const row = {
    datetime: "2026-09-01T06:57:02.367Z",
    date: "2026-09-01",
    account_type: "DEFAULT",
    category: "CASH",
    type: "INTEREST_PAYMENT",
    asset_class: "",
    name: "",
    symbol: "",
    shares: "",
    price: "",
    amount: "0.32",
    fee: "",
    tax: "",
    currency: "EUR",
    original_amount: "",
    original_currency: "",
    fx_rate: "",
    description: "Interest payment",
    transaction_id: "",
    counterparty_name: "",
    counterparty_iban: "",
    payment_reference: "",
    mcc_code: "",
  };

  const first = transformTradeRepublicTransactions([row], "account")[0];
  const second = transformTradeRepublicTransactions([row], "account")[0];

  assert.equal(first.payee_name, "Trade Republic - interest payment");
  assert.equal(first.imported_id, second.imported_id);
  assert.match(first.imported_id, /^[a-f0-9]{32}$/);
});
