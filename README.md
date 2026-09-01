# Smart Library Management System

A Library Management System built with HTML, CSS, JavaScript, Node.js, and MongoDB Atlas. The app is served by Node and saves library state through the MongoDB-backed API.

## Files

- `index.html` - Login/sign-up screens, admin dashboard, student dashboard, and module markup
- `styles.css` - Responsive UI styling
- `app.js` - Library management logic, role-based screens, validation, reports, and exports
- `database.js` - Browser client for the Node API
- `server.js` - Static file server and MongoDB persistence API
- `database.sql` - Relational database schema reference

## Setup

Install dependencies once:

```bash
npm install
```

Copy the example environment file and add your real MongoDB Atlas details only in `.env`:

```bash
copy .env.example .env
```

Required settings (use the Atlas **Connect > Drivers** connection string; do not guess the cluster host name):

```bash
MONGODB_URI="mongodb+srv://<db_username>:<db_password>@cluster0.example.mongodb.net/library_management?retryWrites=true&w=majority&appName=Cluster0"
MONGODB_USERNAME="your_atlas_username"
MONGODB_PASSWORD="your_atlas_password"
MONGODB_DB_NAME=library_management
MONGODB_COLLECTION=library_state
PORT=8000
```

If the database username and password are `Akanksha` and `Akanksha12`, put them in `MONGODB_USERNAME` and `MONGODB_PASSWORD`; leave the `<db_username>` and `<db_password>` placeholders in `MONGODB_URI`. The application login created for a new database uses the same username and password.

`.env`, `.env.*`, and `atlas-credentials.env` are ignored by Git so private database details are not uploaded to GitHub. Keep real credentials out of committed files.

Start the app:

```bash
npm start
```

Then open the URL printed in the terminal. It uses `http://localhost:8000` by default and tries the next available port if `8000` is busy.

Check MongoDB status at `http://localhost:8000/api/health`. If Atlas is unreachable, the page still opens but load/save requests return `503` until the credentials, Atlas IP access list, or network connection are fixed.

## Default Login

- Username: `Akanksha`
- Password: `Akanksha12`

To intentionally replace all existing data in this application's MongoDB collection with this new empty library and the new admin account, run:

```bash
npm run seed
```

This replaces only the document with `_id: "main"` in the configured `library_state` collection; it does not delete the database or other collections. Change the default admin password from the Settings page after the first login.

## Modules

Admin:

- Dashboard
- Books
- Members
- Issue Book
- Return Book
- Transactions
- Reports
- Settings
- Import/export/reset database data

Student:

- Dashboard
- Books
- Return Book
- Settings

The app must be opened through the Node server so browser code can use the MongoDB API. Opening `index.html` directly will not load or save library records.
