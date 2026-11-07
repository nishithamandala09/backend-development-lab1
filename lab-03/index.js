const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, 'books.db');
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// ---------- helpers ----------
const ALLOWED_ORDER_BY = ['id', 'title', 'author', 'price', 'pages'];

const isBlank = (v) => typeof v !== 'string' || v.trim() === '';

const isNumeric = (v) =>
  (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) &&
  Number.isFinite(Number(v));

// returns an error message, or null when the body is valid
const validateBook = (body) => {
  const { title, author, price, pages } = body || {};
  if (isBlank(title)) return 'title is required';
  if (isBlank(author)) return 'author is required';
  if (price === undefined || price === null) return 'price is required';
  if (!isNumeric(price) || Number(price) < 0) {
    return 'price must be a non-negative number';
  }
  if (pages !== undefined && pages !== null && (!isNumeric(pages) || Number(pages) < 0)) {
    return 'pages must be a non-negative number';
  }
  return null;
};

const checkId = (req, res, next) => {
  if (!/^\d+$/.test(req.params.bookId)) {
    return res.status(400).json({ message: 'bookId must be a whole number' });
  }
  next();
};

// ---------- routes (nouns: /books, the method shows the action) ----------

// GET /books/ : search, sort, paginate and filter by price
app.get('/books/', async (req, res) => {
  const {
    search_q = '',
    order_by = 'id',
    order = 'ASC',
    limit = '10',
    offset = '0',
    min_price,
    max_price,
  } = req.query;

  const direction = String(order).toUpperCase();

  if (!ALLOWED_ORDER_BY.includes(order_by)) {
    return res
      .status(400)
      .json({ message: `order_by must be one of: ${ALLOWED_ORDER_BY.join(', ')}` });
  }
  if (!['ASC', 'DESC'].includes(direction)) {
    return res.status(400).json({ message: 'order must be ASC or DESC' });
  }
  if (!isNumeric(limit) || !Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100) {
    return res.status(400).json({ message: 'limit must be a whole number from 1 to 100' });
  }
  if (!isNumeric(offset) || !Number.isInteger(Number(offset)) || Number(offset) < 0) {
    return res.status(400).json({ message: 'offset must be a whole number, 0 or more' });
  }
  if (min_price !== undefined && !isNumeric(min_price)) {
    return res.status(400).json({ message: 'min_price must be a number' });
  }
  if (max_price !== undefined && !isNumeric(max_price)) {
    return res.status(400).json({ message: 'max_price must be a number' });
  }
  if (
    min_price !== undefined &&
    max_price !== undefined &&
    Number(min_price) > Number(max_price)
  ) {
    return res.status(400).json({ message: 'min_price cannot be greater than max_price' });
  }

  const conditions = ['title LIKE ?'];
  const params = [`%${search_q}%`];
  if (min_price !== undefined) {
    conditions.push('price >= ?');
    params.push(Number(min_price));
  }
  if (max_price !== undefined) {
    conditions.push('price <= ?');
    params.push(Number(max_price));
  }

  // order_by and direction are checked against a whitelist above, because
  // placeholders (?) can only be used for values, not for column names.
  const sql = `SELECT * FROM book WHERE ${conditions.join(' AND ')}
               ORDER BY ${order_by} ${direction} LIMIT ? OFFSET ?;`;
  params.push(Number(limit), Number(offset));

  const books = await db.all(sql, params);
  res.status(200).json({
    count: books.length,
    limit: Number(limit),
    offset: Number(offset),
    books,
  });
});

// GET /books/:bookId/ : one book
app.get('/books/:bookId/', checkId, async (req, res) => {
  const book = await db.get('SELECT * FROM book WHERE id = ?;', [req.params.bookId]);
  if (!book) return res.status(404).json({ message: 'Book not found' });
  res.status(200).json(book);
});

// POST /books/ : create
app.post('/books/', async (req, res) => {
  const error = validateBook(req.body);
  if (error) return res.status(400).json({ message: error });

  const { title, author, price, pages } = req.body;
  const result = await db.run(
    'INSERT INTO book(title, author, price, pages) VALUES (?, ?, ?, ?);',
    [title.trim(), author.trim(), Number(price), pages ?? null]
  );
  res.status(201).json({ message: 'Book added', bookId: result.lastID });
});

// PUT /books/:bookId/ : update
app.put('/books/:bookId/', checkId, async (req, res) => {
  const error = validateBook(req.body);
  if (error) return res.status(400).json({ message: error });

  const { bookId } = req.params;
  const existing = await db.get('SELECT id FROM book WHERE id = ?;', [bookId]);
  if (!existing) return res.status(404).json({ message: 'Book not found' });

  const { title, author, price, pages } = req.body;
  await db.run(
    'UPDATE book SET title = ?, author = ?, price = ?, pages = ? WHERE id = ?;',
    [title.trim(), author.trim(), Number(price), pages ?? null, bookId]
  );
  res.status(200).json({ message: 'Book updated' });
});

// DELETE /books/:bookId/ : remove
app.delete('/books/:bookId/', checkId, async (req, res) => {
  const { bookId } = req.params;
  const existing = await db.get('SELECT id FROM book WHERE id = ?;', [bookId]);
  if (!existing) return res.status(404).json({ message: 'Book not found' });

  await db.run('DELETE FROM book WHERE id = ?;', [bookId]);
  res.status(200).json({ message: 'Book deleted' });
});

// ---------- unknown routes and errors (must stay LAST) ----------
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON' });
  }
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});