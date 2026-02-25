# Skaia Backend API

Golang backend service for the Skaia application using Chi router.

## Setup

### Prerequisites

- Go 1.21+
- Make (optional)

### Installation

```bash
cd backend
go mod download
go run main.go
```

## API Endpoints

### Health Check

- `GET /health` - Check if the API is running

### Store Endpoints (`/store`)

- `GET /store` - List all store items
- `POST /store` - Create a new store item
- `GET /store/{id}` - Get a specific store item
- `PUT /store/{id}` - Update a store item
- `DELETE /store/{id}` - Delete a store item

### Forum Endpoints (`/forum`)

- `GET /forum` - List all forum threads
- `POST /forum` - Create a new forum thread
- `GET /forum/{id}` - Get a specific forum thread
- `PUT /forum/{id}` - Update a forum thread
- `DELETE /forum/{id}` - Delete a forum thread

#### Forum Posts

- `GET /forum/{id}/posts` - List all posts in a forum thread
- `POST /forum/{id}/posts` - Create a new post in a forum thread

## Running with Docker

```bash
docker-compose up backend
```

The API will be available at `http://localhost:8080`
