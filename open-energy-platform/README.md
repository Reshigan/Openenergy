# Open Energy Platform

A comprehensive energy trading and management platform built with React, TypeScript, and Cloudflare Workers.

## Features

- **Cockpit Dashboard**: Role-based KPI overview with charts and action items
- **Trading**: Energy order book and execution
- **Carbon Credits**: Portfolio management and retirement
- **Contracts**: Document management with phase tracking
- **Grid Management**: Real-time grid status and power wheeling
- **ESG Dashboard**: Environmental, Social, and Governance metrics
- **Fund Management**: Investment portfolio tracking
- **Marketplace**: Energy products, RECs, and services
- **Admin Dashboard**: KYC queue, participant management, and configuration

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Recharts
- **Backend**: Cloudflare Workers, Hono framework
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Deployment**: Cloudflare Pages + Workers

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Wrangler CLI (`npm install -g wrangler`)

### Frontend Setup

```bash
cd open-energy-platform/pages
npm install
npm run dev
```

### Backend Setup

```bash
cd open-energy-platform
npm install
wrangler dev
```

### Environment Variables

Create a `.env` file in the `pages` directory:

```env
VITE_API_URL=/api
```

For local development with Workers running:
```env
VITE_API_URL=http://localhost:8787
```

## Deployment

### GitHub Actions

The repository is configured with GitHub Actions for CI/CD. On push to `main`:

1. Build the frontend
2. Deploy to Cloudflare Pages
3. Deploy the API Worker

### Required Secrets

Configure these in GitHub repository settings:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Pages edit permissions
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Manual Deployment

```bash
# Deploy frontend to Cloudflare Pages
wrangler pages deploy open-energy-platform/pages/dist --project-name=open-energy-platform

# Deploy API Worker
cd open-energy-platform
wrangler deploy
```

## Project Structure

```
open-energy-platform/
├── pages/                 # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   │   └── pages/    # Page components
│   │   ├── lib/          # API utilities
│   │   └── context/      # React context
│   ├── dist/             # Built output
│   └── package.json
├── src/                   # Cloudflare Workers backend
│   ├── routes/           # API endpoints
│   ├── middleware/       # Auth, security
│   └── index.ts          # Worker entry
├── migrations/           # D1 database migrations
├── schema.sql           # Database schema
└── wrangler.toml        # Wrangler config
```

## API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `GET /api/cockpit/stats` - Dashboard statistics
- `GET /api/trading/orders` - Order book
- `POST /api/trading/orders` - Place order
- `GET /api/carbon/credits` - Carbon portfolio
- `GET /api/contracts` - Contracts list
- And more...

## License

MIT