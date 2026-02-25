# Skaia - Full Stack Application

A full-stack application with a React frontend and Golang backend.

## Architecture

- **Frontend**: React + TypeScript + Vite (port 5173)
- **Backend**: Go with Chi router (port 8080)
- **Linting/Formatting**: Biome for frontend

## Quick Start

### Prerequisites

- Node.js 20+
- Go 1.21+
- Docker & Docker Compose (optional)

### Development

#### Frontend

```bash
cd skaia
npm install
npm run dev
```

Run linter and formatter:

```bash
npm run lint      # Lint code
npm run format    # Format code with Biome
```

#### Backend

```bash
cd backend
go mod download
go run main.go
```

### Docker Compose

Run both services together:

```bash
docker-compose up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8080

## Project Structure

```
skaia/
├── backend/           # Go backend service
│   ├── main.go       # Chi router and endpoints
│   ├── go.mod        # Go module file
│   ├── Dockerfile    # Docker image for backend
│   └── README.md     # Backend documentation
├── skaia/            # React frontend
│   ├── src/          # React components and assets
│   ├── package.json  # Frontend dependencies
│   ├── biome.json    # Biome linting/formatting config
│   ├── Dockerfile    # Docker image for frontend
│   └── vite.config.ts # Vite configuration
└── compose.yml       # Docker Compose orchestration
```

## API Routes

### Health Check

- `GET /health`

### Store (`/store`)

- `GET /store` - List items
- `POST /store` - Create item
- `GET /store/{id}` - Get item
- `PUT /store/{id}` - Update item
- `DELETE /store/{id}` - Delete item

### Forum (`/forum`)

- `GET /forum` - List threads
- `POST /forum` - Create thread
- `GET /forum/{id}` - Get thread
- `PUT /forum/{id}` - Update thread
- `DELETE /forum/{id}` - Delete thread
- `GET /forum/{id}/posts` - List posts in thread
- `POST /forum/{id}/posts` - Create post in thread

## Development Tools

### Frontend

- **Language**: TypeScript
- **Framework**: React 19
- **Build Tool**: Vite
- **Linter/Formatter**: Biome
- **Runtime**: Node.js

### Backend

- **Language**: Go 1.21
- **Router**: Chi v5
- **Runtime**: Go

## Next Steps

1. Implement database models and persistence layer
2. Add authentication/authorization
3. Create React components for frontend
4. Add error handling and validation
5. Set up logging and monitoring
