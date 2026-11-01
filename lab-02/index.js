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

// 1. Get all books
app.get('/books/', async (req, res) => {
  const books = await db.all('SELECT * FROM book ORDER BY id;');
  res.status(200).json(books);
});

// 2. Get one book
app.get('/books/:bookId/', async (req, res) => {
  const { bookId } = req.params;
  const book = await db.get('SELECT * FROM book WHERE id = ?;', [bookId]);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.status(200).json(book);
});

// 3. Add a book
app.post('/books/', async (req, res) => {
  const { title, author, price, pages } = req.body;
  if (!title || !author || price === undefined || pages === undefined) {
    return res.status(400).json({ error: 'title, author, price and pages are required' });
  }
  const result = await db.run(
    'INSERT INTO book(title, author, price, pages) VALUES (?, ?, ?, ?);',
    [title, author, price, pages]
  );
  res.status(201).json({ message: 'Book added', bookId: result.lastID });
});

// 4. Update a book
app.put('/books/:bookId/', async (req, res) => {
  const { bookId } = req.params;
  const { title, author, price, pages } = req.body;
  if (!title || !author || price === undefined || pages === undefined) {
    return res.status(400).json({ error: 'title, author, price and pages are required' });
  }
  const existing = await db.get('SELECT id FROM book WHERE id = ?;', [bookId]);
  if (!existing) return res.status(404).json({ error: 'Book not found' });
  await db.run(
    'UPDATE book SET title = ?, author = ?, price = ?, pages = ? WHERE id = ?;',
    [title, author, price, pages, bookId]
  );
  res.status(200).json({ message: 'Book updated' });
});

// 5. Delete a book
app.delete('/books/:bookId/', async (req, res) => {
  const { bookId } = req.params;
  const existing = await db.get('SELECT id FROM book WHERE id = ?;', [bookId]);
  if (!existing) return res.status(404).json({ error: 'Book not found' });
  await db.run('DELETE FROM book WHERE id = ?;', [bookId]);
  res.status(200).json({ message: 'Book deleted' });
});