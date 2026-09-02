# Smart Library Management System

A Library Management System built with HTML, CSS, JavaScript, Node.js, and MongoDB Atlas. The app is served by Node and saves library state through the MongoDB-backed API.

## Files

* `index.html` - Login/sign-up screens, admin dashboard, student dashboard, and module markup
* `styles.css` - Responsive UI styling
* `app.js` - Library management logic, role-based screens, validation, reports, and exports
* `database.js` - Browser client for the Node API
* `server.js` - Static file server and MongoDB persistence API
* `database.sql` - Relational database schema reference

## Setup

Install dependencies once:

```bash
npm install
```

Copy the example environment file and add your real MongoDB Atlas details only in `.env`:

```bash
copy .env.example .env
```

Required settings:

```bash
MONGODB_URI="mongodb+srv://<db_username>:<db_password>@cluster0.example.mongodb.net/library_management?retryWrites=true&w=majority&appName=Cluster0"

MONGODB_USERNAME="your_atlas_username"
MONGODB_PASSWORD="your_atlas_password"
MONGODB_DB_NAME=library_management
MONGODB_COLLECTION=library_state
PORT=8000
```

**Important:** Keep real MongoDB credentials inside `.env` only. Do not upload passwords or other private database credentials to GitHub.

## Start the App

```bash
npm start
```

Then open the URL printed in the terminal.

By default:

```text
http://localhost:8000
```

MongoDB health can be checked at:

```text
http://localhost:8000/api/health
```

## Deploy on Vercel

The project includes a Vercel serverless entry point in `api/index.js`. In the
Vercel project settings, add these environment variables (using your real Atlas
values) before deploying:

```text
MONGODB_URI
MONGODB_DB_NAME
MONGODB_COLLECTION
```

If your URI still contains `<db_username>` or `<db_password>`, also add
`MONGODB_USERNAME` and `MONGODB_PASSWORD`. In MongoDB Atlas, allow Vercel to
reach the cluster (temporarily `0.0.0.0/0`, or restrict it to Vercel's current
outbound IP ranges) and ensure the database user has read/write access.

## Default Login

* Username: `Akanksha`
* Password: `Akanksha12`

To seed the database with the initial library data:

```bash
npm run seed
```

Change the default admin password from the Settings page after the first login.

## Modules

### Admin

* Dashboard
* Books
* Members
* Issue Book
* Return Book
* Transactions
* Reports
* Settings
* Import/export/reset database data

### Student

* Dashboard
* Books
* Return Book
* Settings

The application must be opened through the Node server so the browser can communicate with the MongoDB API. Opening `index.html` directly will not load or save library records.
