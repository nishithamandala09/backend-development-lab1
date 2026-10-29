const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Route 1: home
app.get('/', (req, res) => {
  res.status(200).send('Welcome to my Express server');
});

// Route 2: about (JSON)
app.get('/about', (req, res) => {
  res.status(200).json({ name: 'Nishitha', section: '111' });
});

// Route 3: time
app.get('/time', (req, res) => {
  res.status(200).json({ time: new Date().toString() });
});

// 404 for any unknown path (must be LAST)
app.use((req, res) => {
  res.status(404).send('404 - Route not found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});