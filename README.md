# Bookworm Backend API

A RESTful API for the Bookworm book tracking application, built with Fastify, TypeScript, and PostgreSQL.

## Features

- 🔐 JWT-based authentication
- 📚 Book search and management (Google Books API integration)
- 📖 Personal library tracking
- 🎯 Reading goals and progress
- 📍 Location-based book boxes
- 👥 Social features (following, reviews, activity feed)
- 📊 Reading statistics and achievements

## Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Google Books API key
- Resend API key (for emails)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/bookworm-backend.git
cd bookworm-backend
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start PostgreSQL and Redis:

```bash
docker-compose up -d
```

5. Run database migrations:

```bash
npm run db:migrate
```

6. Start the development server:

```bash
npm run dev
```

## API Documentation

The API is available at `http://localhost:3001`

### Authentication Endpoints

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/logout` - Logout current session
- `GET /api/v1/auth/me` - Get current user

### Book Endpoints

- `GET /api/v1/books/search?q={query}` - Search books
- `GET /api/v1/books/{googleId}` - Get book details
- `GET /api/v1/books/trending` - Get trending books
- `GET /api/v1/books/recommendations` - Get personalized recommendations

### Library Endpoints

- `GET /api/v1/library` - Get user's library
- `POST /api/v1/library/books` - Add book to library
- `PATCH /api/v1/library/books/{id}` - Update book in library
- `DELETE /api/v1/library/books/{id}` - Remove book from library

## Deployment

1. Build the project:

```bash
npm run build
```

2. Set production environment variables

3. Start the production server:

```bash
npm start
```

## License

MIT
