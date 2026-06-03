# AI Content Generator

A pastel-themed AI content generator built with Next.js and Vercel API routes.

## Features

- AI-generated multi-card content results
- Fixed-size scrollable result cards
- Copy-to-clipboard actions
- Responsive UI with soft gradient styling
- Frontend and backend deploy together on Vercel

## Run locally

```bash
npm install
npm run dev
```

## Environment variables

Create `.env.local` from `.env.example` and set:

```bash
AI_PROVIDER=cerebras
CEREBRAS_API_KEY=your_key_here
FRENIX_API_KEY=your_key_here
```

## Deploy to Vercel

1. Import this GitHub repo into Vercel.
2. Add the environment variables from `.env.example`.
3. Deploy the project as a single Next.js app.
