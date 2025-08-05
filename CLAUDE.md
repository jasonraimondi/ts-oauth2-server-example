# Claude Development Notes

## Project Overview
TypeScript OAuth2 server example implementation using NestJS/Express server and SvelteKit client. This demonstrates real-world usage of the @jmondi/oauth2-server package.

## Development Setup
```bash
# Install dependencies
pnpm install
pnpm install --prefix web

# Start database
docker compose up -d

# Run migrations and seed
pnpm db:migrate
pnpm db:seed

# Start development servers
overmind start  # or foreman start
```

## Available Scripts
- `pnpm dev` - Start server in development mode
- `pnpm build` - Build TypeScript
- `pnpm db:migrate` - Run Prisma migrations
- `pnpm db:migrate:prod` - Deploy migrations to production
- `pnpm db:seed` - Seed database with initial data
- `pnpm format` - Format code with Prettier
- `pnpm gen` - Generate Prisma client

## Project Structure
- `/src` - Main server application (NestJS)
- `/web` - SvelteKit client application
- `/prisma` - Database schema and migrations
- `/views` - Server-side templates (Nunjucks)

## Key Components
- OAuth2 authorization server implementation
- User authentication and management
- Client registration and management
- Scope-based authorization
- JWT token handling

## Database
- PostgreSQL database running in Docker
- Prisma ORM for database operations
- Migrations in `/prisma/migrations`

## Development Notes
- Server runs on default NestJS port
- Web client runs separately via SvelteKit
- Uses ESM modules (`"type": "module"`)
- CSRF protection enabled