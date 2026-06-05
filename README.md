# DVJ-ERP

Internal ERP for **DV Jewelry Corp**: replenishment planning from sales and stock, client defaults, Excel import, RBAC, and system configuration.

Built with **Next.js 16**, **React 19**, **PostgreSQL** (Prisma), and **Tailwind CSS 4**.

## Getting started

```bash
npm install
cp .env.example .env   # configure DATABASE_URL, JWT_SECRET, etc.
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

- `CLAUDE.md` — code-accurate project overview
- `docs/SCHEMA.md` — database schema
- `docs/PROGRESS.md` — completed features
