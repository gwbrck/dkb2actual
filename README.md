# newbank

Import DKB bank statement CSVs into [Actual Budget](https://actualbudget.org).

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Actual Budget server URL, password, and sync ID
# Edit src/config.ts with your Actual Budget account IDs
```

## Usage

1. Download your DKB CSV exports to `~/Downloads`
2. Run:

```bash
npm start
```

The tool will find today's DKB exports, parse them, and import the transactions into Actual Budget.
