# URL Monitoring API

A Node.js and PostgreSQL API for monitoring URLs, recording health checks, tracking uptime and latency, and managing incidents.

## Features

- Register and manage URL monitors
- Configure check intervals and expected HTTP status codes
- Automatically check active monitors with a scheduler
- Record check results, status codes, latency, and errors
- Track monitoring incidents
- Automatically open incidents when a monitor fails
- Automatically resolve incidents when a monitor recovers
- View check history with cursor-based pagination
- Export check history as CSV
- Calculate uptime and latency statistics
- Expose a public status endpoint
- Validate requests with Zod
- Persist data in PostgreSQL
- Generate API documentation with Swagger UI
- Add security headers with Helmet and CORS

## Tech Stack

- Node.js 20+
- Express 5
- PostgreSQL 16+
- Zod
- pg
- Swagger UI
- OpenAPI 3.0.3
- Supertest
- Node.js built-in test runner

## Requirements

- Node.js 20+
- PostgreSQL 16+
- npm

## Installation

Clone the repository and install dependencies:

```bash
npm install
```

Create a `.env` file in the project root with values similar to:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/url_monitoring
PORT=4000
CHECK_TIMEOUT_MS=10000
```

Adjust the database connection string to match your PostgreSQL setup.

## Database Setup

Create the database in PostgreSQL, then run:

```bash
npm run db:schema
```

To load the seed data:

```bash
npm run db:seed
```

## Running the API

Start the development server:

```bash
npm run dev
```

Or start the application directly:

```bash
npm start
```

The API will be available at:

```text
http://localhost:4000
```

## Health Check

```http
GET /health
```

Example response:

```json
{
  "status": "ok"
}
```

## API Documentation

Interactive Swagger documentation is available at:

```text
http://localhost:4000/docs/
```

The API specification uses OpenAPI 3.0.3.

## API Endpoints

### Monitors

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | /monitors | Create a monitor |
| GET | /monitors | List monitors |
| GET | /monitors/:id | Get a monitor |
| PATCH | /monitors/:id | Update a monitor |
| DELETE | /monitors/:id | Delete a monitor |

### Checks

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /monitors/:id/checks | Get check history |
| GET | /monitors/:id/checks.csv | Export check history as CSV |

### Uptime

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /monitors/:id/uptime | Get uptime and latency statistics |

### Incidents

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /incidents | List all incidents |
| GET | /monitors/:id/incidents | List incidents for a monitor |

### Public Status

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /status | Get the current status of active monitors |

## Creating a Monitor

Example request:

```http
POST /monitors
Content-Type: application/json
```

```json
{
  "name": "Example",
  "url": "https://example.com",
  "interval_seconds": 60,
  "expected_status": 200
}
```

The monitor is then checked by the scheduler according to its configured interval.

## Check Results

Each check records information including:

- whether the request succeeded
- HTTP status code
- response latency
- error details when applicable
- timestamp of the check

Failed checks can create an open incident for the monitor. Only one open incident is allowed per monitor at a time. When a successful check is recorded after an incident, the incident is resolved.

## Pagination

Monitor and check history endpoints use cursor-based pagination.

Example:

```http
GET /monitors?limit=10
```

To request the next page:

```http
GET /monitors?after=10&limit=10
```

The API returns a `next_cursor` when more records are available.

## Uptime Reporting

Example:

```http
GET /monitors/1/uptime?window=24h
```

The response includes:

- uptime percentage
- average latency
- 95th percentile latency

## CSV Export

Check history can be exported as CSV:

```http
GET /monitors/1/checks.csv
```

## Testing

Run the complete test suite:

```bash
npm test
```

The tests use a separate test database configured through `.env.test`.

## Scheduler

The monitoring scheduler runs inside the application process and:

- loads active monitors
- determines which monitors are due for a check
- sends an HTTP request to each due monitor
- records the check result
- opens an incident when a monitor changes to a failed state
- resolves an existing incident when the monitor recovers

The request timeout can be configured with:

```env
CHECK_TIMEOUT_MS=10000
```

## Project Structure

```text
src/
├── app.js
├── server.js
├── config/
├── controllers/
├── db/
├── routes/
├── schemas/
├── scheduler/
├── services/
├── sql/

test/
├── checks.test.js
├── incidents.test.js
├── monitors.test.js
├── scheduler.test.js
├── setup.js
├── status.test.js
└── uptime.test.js
```

## Error Handling

The API validates request parameters and bodies using Zod.

- invalid requests return HTTP 400
- requests for resources that do not exist return HTTP 404
- unexpected server errors return HTTP 500

## Security

The API uses:

- parameterized PostgreSQL queries
- Zod request validation
- Helmet security headers
- CORS middleware
- whitelisted monitor update fields

Database operations involving incident state changes use PostgreSQL transactions.

## License

This project was created as a URL monitoring API assignment and learning project.
