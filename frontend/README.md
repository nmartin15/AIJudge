This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Simulation Mode Flag

The UI simulation supports a runtime mode flag:

- `NEXT_PUBLIC_SIMULATION_MODE=mock` (default): runs fully local mock scoring
- `NEXT_PUBLIC_SIMULATION_MODE=backend`: sends case + judgment requests to the FastAPI backend

Copy `frontend/.env.local.example` to `frontend/.env.local` and adjust values as needed.

Optional API client tuning:

- `NEXT_PUBLIC_API_TIMEOUT_MS=8000` request timeout in milliseconds
- `NEXT_PUBLIC_API_RETRIES=1` retries for idempotent requests (GET/HEAD/OPTIONS)

Example:

```bash
# PowerShell
$env:NEXT_PUBLIC_SIMULATION_MODE="backend"
npm run dev
```

If backend mode fails at runtime, the UI falls back to mock results and shows a warning.

## Tests

Run unit/component tests with:

```bash
npm test
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
