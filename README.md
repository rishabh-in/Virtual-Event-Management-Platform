# Virtual Event Management Platform API

A NestJS backend assignment for managing virtual events, attendees, registrations, and registration confirmation emails.

The application uses in-memory storage only. All users, events, and registrations are lost when the server restarts.

## Features

- User registration for organizers and attendees
- Login with JWT bearer authentication
- Password hashing with bcrypt
- Role-based authorization with organizer and attendee roles
- Event creation, listing, detail retrieval, update, and deletion
- Attendee event registration and cancellation
- Attendee view of registered events
- Event owner view of safe participant details
- Registration confirmation email through a replaceable email provider
- Consistent API error response shape
- Global request validation and unknown-field rejection
- Unit and end-to-end test coverage

## Technology Stack

- Node.js
- TypeScript
- NestJS
- `@nestjs/config`
- `@nestjs/jwt`
- `@nestjs/passport`
- `passport`
- `passport-jwt`
- `bcrypt`
- `class-validator`
- `class-transformer`
- Nodemailer
- Jest
- Supertest
- ESLint
- Prettier
- UUIDs from Node `crypto.randomUUID()`

## Architecture Overview

The project is organized by business feature:

```text
src/
  app.module.ts
  app.setup.ts
  main.ts
  auth/
  common/
  config/
  email/
  events/
  registrations/
  users/
test/
  app.e2e-spec.ts
```

Controllers handle HTTP transport concerns. Services contain application and business logic. Repositories own in-memory persistence. Authentication, roles, repositories, and email delivery are injected through NestJS dependency injection.

## SOLID Principles Applied

- Single Responsibility: auth, users, events, registrations, and email each have focused services.
- Open/Closed: email and repositories are behind interfaces/tokens, so implementations can be replaced.
- Liskov Substitution: in-memory repositories follow async contracts suitable for future database-backed repositories.
- Interface Segregation: user, event, and email contracts are small and feature-specific.
- Dependency Inversion: services depend on repository and email abstractions rather than concrete classes.

## Prerequisites

- Node.js 20 or newer recommended
- npm

## Installation

```bash
npm install
```

## Environment Setup

Create a local `.env` file from `.env.example` if you want to override defaults:

```bash
PORT=3000

JWT_SECRET=replace-with-a-secure-secret
JWT_EXPIRES_IN=1h

BCRYPT_SALT_ROUNDS=10

EMAIL_TRANSPORT=json
EMAIL_FROM=no-reply@example.com

SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
```

Do not commit `.env`. It is ignored by Git.

Production requires `JWT_SECRET`. Development and tests can run with a clearly named development-only fallback. For email, `EMAIL_TRANSPORT=json` is the safe development default. Use `EMAIL_TRANSPORT=smtp` only with complete SMTP settings.

## Running The Application

```bash
npm run start:dev
```

The API listens on `PORT`, defaulting to `3000`.

Health check:

```bash
GET /health
```

## Available Scripts

```bash
npm run start:dev
npm run build
npm run start:prod
npm run lint
npm run format
npm run test
npm run test:watch
npm run test:e2e
```

## Authentication

Login returns a JWT access token:

```http
Authorization: Bearer <token>
```

JWT payloads contain only:

```json
{
  "sub": "user-id",
  "role": "attendee"
}
```

Passwords and password hashes are never included in JWTs or API responses.

## Roles And Permissions

Supported roles:

- `organizer`
- `attendee`

Permissions:

- Public users can list and view events.
- Organizers can create events.
- Only the organizer who owns an event can update, delete, or view participants.
- Attendees can register for events, cancel registration, and view their registered events.
- Organizers cannot use the attendee registration endpoint.

## API Endpoints

### Register

```http
POST /register
```

Request:

```json
{
  "name": "Event Organizer",
  "email": "organizer@example.com",
  "password": "Password123!",
  "role": "organizer"
}
```

Response `201`:

```json
{
  "id": "user-id",
  "name": "Event Organizer",
  "email": "organizer@example.com",
  "role": "organizer",
  "createdAt": "2026-07-21T00:00:00.000Z"
}
```

### Login

```http
POST /login
```

Request:

```json
{
  "email": "organizer@example.com",
  "password": "Password123!"
}
```

Response `200`:

```json
{
  "accessToken": "jwt-token",
  "user": {
    "id": "user-id",
    "name": "Event Organizer",
    "email": "organizer@example.com",
    "role": "organizer"
  }
}
```

### List Events

```http
GET /events
```

Public endpoint. Participant IDs are not exposed.

Response `200`:

```json
[
  {
    "id": "event-id",
    "title": "NestJS Summit",
    "description": "A virtual event about NestJS",
    "scheduledAt": "2026-08-01T10:00:00.000Z",
    "organizerId": "organizer-id",
    "participantCount": 0,
    "createdAt": "2026-07-21T00:00:00.000Z",
    "updatedAt": "2026-07-21T00:00:00.000Z"
  }
]
```

### Get Event

```http
GET /events/:id
```

Returns `404` when the event does not exist.

### Create Event

```http
POST /events
Authorization: Bearer <organizer-token>
```

Request:

```json
{
  "title": "NestJS Summit",
  "description": "A virtual event about NestJS",
  "scheduledAt": "2026-08-01T10:00:00.000Z"
}
```

Clients cannot provide `organizerId`, `participantIds`, IDs, or timestamps.

### Update Event

```http
PUT /events/:id
Authorization: Bearer <organizer-token>
```

This `PUT` endpoint updates editable event fields rather than performing a full replacement.

Editable fields:

- `title`
- `description`
- `scheduledAt`

At least one editable field is required.

### Delete Event

```http
DELETE /events/:id
Authorization: Bearer <organizer-token>
```

Response `204`.

### Register For Event

```http
POST /events/:id/register
Authorization: Bearer <attendee-token>
```

Response `201`:

```json
{
  "message": "Event registration successful",
  "emailNotificationSent": true,
  "event": {
    "id": "event-id",
    "title": "NestJS Summit",
    "description": "A virtual event about NestJS",
    "scheduledAt": "2026-08-01T10:00:00.000Z",
    "organizerId": "organizer-id",
    "participantCount": 1,
    "createdAt": "2026-07-21T00:00:00.000Z",
    "updatedAt": "2026-07-21T00:00:00.000Z"
  }
}
```

The authenticated attendee ID is always used. Any attendee ID in the request body is ignored.

### My Registered Events

```http
GET /me/events
Authorization: Bearer <attendee-token>
```

Returns events the current attendee is registered for.

### Cancel Registration

```http
DELETE /events/:id/register
Authorization: Bearer <attendee-token>
```

Response `204`. Returns `404` with `REGISTRATION_NOT_FOUND` if the attendee is not registered.

### Event Participants

```http
GET /events/:id/participants
Authorization: Bearer <organizer-token>
```

Only the event owner can access this endpoint.

Response `200`:

```json
[
  {
    "id": "attendee-id",
    "name": "Attendee",
    "email": "attendee@example.com"
  }
]
```

Password hashes are never returned.

## Error Response Format

Errors use a consistent structure:

```json
{
  "statusCode": 404,
  "code": "EVENT_NOT_FOUND",
  "message": "Event not found",
  "path": "/events/event-id",
  "timestamp": "2026-07-21T00:00:00.000Z"
}
```

Validation errors return `code: "VALIDATION_ERROR"` and an array of messages.

## Date And Time Behavior

Use ISO 8601 date-time strings for `scheduledAt`.

Dates are stored as JavaScript `Date` values and returned as UTC ISO 8601 strings. Events must be scheduled in the future. Registration is rejected once an event has started or passed.

## Email Notification Behavior

Successful attendee registration attempts to send a confirmation email containing:

- attendee name
- event title
- scheduled date and time

Behavior:

1. Persist the registration.
2. Attempt to send the confirmation email.
3. If email delivery fails, log the error without secrets.
4. Do not roll back the registration.
5. Return `emailNotificationSent: false`.

This keeps the primary registration workflow independent from email-provider availability.

Tests override the email provider and never send real emails.

## In-Memory Storage Behavior

Users and events are stored in memory using `Map`.

Important limitations:

- All data is lost when the application restarts.
- Data is not shared between multiple app processes.
- This project intentionally does not use a database.

The repository interfaces make it possible to replace in-memory storage with database-backed implementations later without rewriting controllers or core business logic.

## Testing

Run all checks:

```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

Format source and tests:

```bash
npm run format
```

Unit tests focus on services and business behavior. E2E tests use Supertest against a Nest testing application, reset in-memory repositories between tests, and override email delivery.

## Security Considerations

- Passwords are hashed with bcrypt.
- Plain-text passwords, hashes, JWTs, authorization headers, and SMTP credentials are not logged.
- Password hashes are never returned in API responses.
- JWT payloads contain only required identity and role data.
- Unknown request fields are rejected globally.
- Production requires `JWT_SECRET`.
- Real `.env` files are ignored by Git.

## Design Decisions

- Feature modules keep related controllers, services, DTOs, and repositories together.
- Public event listing returns `participantCount` rather than participant IDs.
- Event ownership is checked in `EventsService` because it is resource-specific authorization.
- Registration participant IDs live on the event entity to avoid duplicate sources of truth.
- Email delivery is abstracted behind `EMAIL_SERVICE`.
- Background queues are intentionally not used for this assignment.

## Known Limitations

- No database persistence.
- No pagination.
- No refresh tokens.
- No rate limiting.
- No background email retry.
- In-memory writes are suitable only for this assignment and single-process development.

## Future Improvements

- Replace in-memory repositories with database-backed repositories.
- Add pagination and filtering for event lists.
- Add refresh tokens and token revocation.
- Add API documentation with Swagger after all core behavior is stable.
- Add rate limiting and production-grade observability.
- Add background email retry with a queue if the project grows.

## Public GitHub Submission Instructions

The repository must be public for assignment submission.

If you have not created a GitHub repository yet:

```bash
git init
git branch -M master
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin master
```

If the remote already exists:

```bash
git remote -v
git push origin master
```

Then open the repository on GitHub, confirm visibility is public in repository settings, and submit the repository URL.
