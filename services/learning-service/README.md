# YAP Learning Service

The Learning Service manages language learning paths, user progress tracking, and lesson completions in the YAP application.

## Features

- User progress tracking through lessons
- Vocabulary management
- Daily lessons and quizzes
- Progress statistics and history
- MongoDB integration for data storage

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or remote)

### Installation

1. Install dependencies:

```bash
npm install
```

2. Set environment variables (create a `.env` file):

```
PORT=8080
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=yap

# For local development, you can use MongoDB Atlas or a local MongoDB instance
# To use Atlas, copy the connection string from mongodb-secrets.yaml in the k8s directory
```

3. Initialize the database with sample data:

```bash
npm run init-db
```

4. Start the service:

```bash
npm run dev
```

## API Endpoints

### Progress Endpoints

- `GET /progress` - Get user's lesson progress
- `POST /progress` - Update user's lesson progress
- `GET /progress/history` - Get user's lesson completion history

### Lesson Endpoints

- `GET /lessons/:lessonId` - Get lesson details by ID
- `GET /lessons` - Get lessons by language and level
- `GET /lessons/next/:lessonId` - Get the next lesson after the specified lesson

### Daily Lesson Endpoints

- `GET /daily` - Get vocabulary for today's lesson
- `POST /daily/complete` - Submit a daily lesson completion

### Quiz Endpoints

- `GET /quiz` - Get today's quiz words
- `POST /quiz/submit` - Submit a quiz answer

## Testing

### Setup for Testing

Before running tests, initialize the test database with sample data:

```bash
npm run init-atlas-db
```

This will populate the `yap_test` database in MongoDB Atlas with sample lessons and create the necessary collections and indexes.

### Running Tests

Run the unit test suite:

```bash
npm test
```

Test the progress tracking functionality using MongoDB Atlas:

```bash
npm run test:progress
```

Test all functionality with MongoDB Atlas:

```bash
npm run test:atlas
```

Note: The tests use a separate `yap_test` database on MongoDB Atlas to avoid affecting production data.

## JWT Integration

The learning progress is minimally stored in JWTs with three key fields:
- `currentLessonId`: ID of the user's current lesson
- `currentWordId`: ID of the user's current vocabulary word
- `nextWordAvailableAt`: ISO timestamp of when the next word is available

The auth service fetches these fields from the learning service when generating JWTs.
