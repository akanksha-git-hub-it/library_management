CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  library_name VARCHAR(120) NOT NULL,
  fine_rate_per_day INTEGER NOT NULL DEFAULT 5,
  default_loan_days INTEGER NOT NULL DEFAULT 14
);

CREATE TABLE members (
  member_id VARCHAR(12) PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  registration_no VARCHAR(40) NOT NULL UNIQUE,
  email VARCHAR(120),
  phone VARCHAR(20),
  department VARCHAR(80),
  semester INTEGER,
  address VARCHAR(255),
  join_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active'
);

CREATE TABLE users (
  user_id VARCHAR(12) PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(120),
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'student')),
  member_id VARCHAR(12),
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at DATE NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(member_id)
);

CREATE TABLE books (
  book_id VARCHAR(12) PRIMARY KEY,
  isbn VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(180) NOT NULL,
  author VARCHAR(140) NOT NULL,
  category VARCHAR(80) NOT NULL,
  publisher VARCHAR(120),
  publication_year INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  available INTEGER NOT NULL CHECK (available >= 0),
  shelf VARCHAR(40)
);

CREATE TABLE transactions (
  transaction_id VARCHAR(12) PRIMARY KEY,
  member_id VARCHAR(12) NOT NULL,
  book_id VARCHAR(12) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  return_date DATE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Issued', 'Returned')),
  fine_amount INTEGER NOT NULL DEFAULT 0,
  fine_paid BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY (member_id) REFERENCES members(member_id),
  FOREIGN KEY (book_id) REFERENCES books(book_id)
);
