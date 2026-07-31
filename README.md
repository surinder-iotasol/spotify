# spotify

A full-stack music streaming platform built with Next.js 14, TypeScript, MongoDB (Prisma ORM), and Tailwind CSS.

## Repository Layout

```
├── app/                  # Next.js App Router pages and layouts
├── components/           # Reusable React components
├── lib/                  # Shared utilities, services, and middleware
├── prisma/               # Prisma schema and migration files
├── e2e/                  # Playwright end-to-end tests
├── scripts/              # Dev and deployment scripts
├── prd.json              # Product requirements document
└── next.config.js        # Next.js configuration
```

## Setup Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ or **pnpm** 8+
- **MongoDB** 6+ (local or Atlas)
- **Git**

## Development Scripts

| Script | Description |
|--------|-------------|
| `npm install` | Install all project dependencies |
| `npm run dev` | Start the Next.js development server on `http://localhost:3000` |
| `npm run build` | Build the production application |
| `npm start` | Start the production server |
| `npm test` | Run Vitest unit and integration tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run lint` | Run ESLint across the codebase |
| `npx prisma generate` | Generate the Prisma client |
| `npx prisma db push` | Push the Prisma schema to the database |

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values before running the development server.

## License

Private — all rights reserved.
