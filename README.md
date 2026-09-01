# newbank

Import DKB and Trade Republic transaction CSVs into [Actual Budget](https://actualbudget.org).

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your Actual Budget server URL, password, and sync ID
# Add your DKB or Trade Republic accounts to .env
```

## Usage

1. Download your DKB CSV exports to `~/Downloads`. For Trade Republic, place the export at `~/Downloads/Transaktionsexport.csv`.
2. Run:

```bash
npm start
```

The tool finds the configured account exports, parses them, and imports the transactions into Actual Budget. Configure each account with `ACCOUNT_X_TYPE=dkb` or `ACCOUNT_X_TYPE=traderepublic`; see `.env.example` for complete examples.
