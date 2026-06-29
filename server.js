const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS, 10) || 10;

// Initialize database
const db = new Database('bingo.db');

// Create tables (ensure they exist before indexes / prepared statements)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cartones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    control TEXT NOT NULL,
    nombre TEXT NOT NULL,
    matrix TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, control)
  );

  CREATE TABLE IF NOT EXISTS figuras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    selected_cells TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Performance pragmas for faster startup and concurrent reads/writes
try {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('busy_timeout = 5000');
} catch (e) {
  console.warn('Could not set SQLite pragmas:', e.message);
}

// Create helpful indexes for faster lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_cartones_user_control ON cartones(user_id, control);
  CREATE INDEX IF NOT EXISTS idx_cartones_user ON cartones(user_id);
`);

// Prepared statements (reuse for speed)
const stmtGetUserByUsername = db.prepare('SELECT id, username, password FROM users WHERE username = ?');
const stmtInsertUser = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
const stmtGetCartonesByUser = db.prepare('SELECT id, control, nombre, matrix FROM cartones WHERE user_id = ?');
const stmtInsertCarton = db.prepare('INSERT INTO cartones (user_id, control, nombre, matrix) VALUES (?, ?, ?, ?)');
const stmtUpdateCarton = db.prepare('UPDATE cartones SET control = ?, nombre = ?, matrix = ? WHERE id = ? AND user_id = ?');
const stmtDeleteCarton = db.prepare('DELETE FROM cartones WHERE id = ? AND user_id = ?');
const stmtGetFiguraByUser = db.prepare('SELECT * FROM figuras WHERE user_id = ?');
const stmtInsertFigura = db.prepare('INSERT INTO figuras (user_id, selected_cells) VALUES (?, ?)');
const stmtUpdateFigura = db.prepare('UPDATE figuras SET selected_cells = ? WHERE user_id = ?');
const stmtDeleteFigura = db.prepare('DELETE FROM figuras WHERE user_id = ?');

// (tables already created above)

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = stmtInsertUser.run(username, hashedPassword);
    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, username } });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = stmtGetUserByUsername.get(username);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username } });
});

// Cartones routes
app.get('/api/cartones', authenticateToken, (req, res) => {
  const cartones = stmtGetCartonesByUser.all(req.user.id);
  res.json(cartones.map(c => ({ ...c, matrix: JSON.parse(c.matrix) })));
});

app.post('/api/cartones', authenticateToken, (req, res) => {
  const { control, nombre, matrix } = req.body;

  if (!control || !nombre || !matrix) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const result = stmtInsertCarton.run(req.user.id, control, nombre, JSON.stringify(matrix));
    res.json({ id: result.lastInsertRowid, control, nombre, matrix });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).json({ error: 'Control number already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/cartones/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { control, nombre, matrix } = req.body;

  if (!control || !nombre || !matrix) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const result = stmtUpdateCarton.run(control, nombre, JSON.stringify(matrix), id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Carton not found' });
  }

  res.json({ id, control, nombre, matrix });
});

app.delete('/api/cartones/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const result = stmtDeleteCarton.run(id, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Carton not found' });
  }

  res.json({ message: 'Carton deleted successfully' });
});

// Figura routes
app.get('/api/figura', authenticateToken, (req, res) => {
  const figura = stmtGetFiguraByUser.get(req.user.id);
  if (figura) {
    res.json({ ...figura, selected_cells: JSON.parse(figura.selected_cells) });
  } else {
    res.json(null);
  }
});

app.post('/api/figura', authenticateToken, (req, res) => {
  const { selected_cells } = req.body;

  if (!selected_cells) {
    return res.status(400).json({ error: 'Selected cells are required' });
  }

  const existing = stmtGetFiguraByUser.get(req.user.id);

  if (existing) {
    stmtUpdateFigura.run(JSON.stringify(selected_cells), req.user.id);
    res.json({ selected_cells });
  } else {
    stmtInsertFigura.run(req.user.id, JSON.stringify(selected_cells));
    res.json({ selected_cells });
  }
});

app.delete('/api/figura', authenticateToken, (req, res) => {
  const result = stmtDeleteFigura.run(req.user.id);
  res.json({ message: 'Figura deleted successfully' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
