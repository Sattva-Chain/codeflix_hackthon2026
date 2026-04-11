# How to Run This Project

## Prerequisites

- Node.js installed
- npm installed

## Install dependencies

1. `cd back`
2. `npm install`
3. `cd ../client`
4. `npm install`
5. `cd ../electronjs`
6. `npm install`

## Run the full Electron app

From `electronjs`:

```bash
npm run dev
```

This starts the React UI, backend server, and Electron container together.

If PowerShell blocks `npm.ps1`, use `npm.cmd` instead:

```bash
npm.cmd run dev
```

## Run only the frontend

From `client`:

```bash
npm run dev
```

## Run only the backend

From `back`:

```bash
npm start
```

## Build frontend for production

From `client`:

```bash
npm run build
```

## Notes

- The Electron runner expects `client` and `back` folders to be at the same level as `electronjs`.
- The login screen now includes a `Continue in local scan mode` path so the scanner UI can be used even if MongoDB auth is unavailable.
- Use `npm run reinstall` in each folder to clean and reinstall dependencies if needed.
