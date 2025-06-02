const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'your_jwt_secret_key'; // In production, use environment variable

app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/medicpd', { useNewUrlParser: true, useUnifiedTopology: true });

// Task schema/model
const taskSchema = new mongoose.Schema({
  title: String,
  description: String,
  budget: Number,
  deadline: String,
  status: { type: String, default: 'pending' }
});
const Task = mongoose.model('Task', taskSchema);

// Helper function to generate JWT token
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
}

// Signup route
app.post('/api/signup', async (req, res) => {
  const { name, email, password, phone, role, type } = req.body;
  if (!name || !email || !password || !phone || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (role === 'CLIENT' && !type) {
    return res.status(400).json({ error: 'Client type is required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (name, email, password, phone, role, type) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sql, [name, email, hashedPassword, phone, role, type || null], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ error: 'Email already registered' });
        }
        return res.status(500).json({ error: 'Database error' });
      }
      const user = { id: this.lastID, name, email, role, type };
      const token = generateToken(user);
      res.json({ message: 'User registered successfully', token, user });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login route
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  const sql = 'SELECT * FROM users WHERE email = ?';
  db.get(sql, [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = generateToken(user);
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role, type: user.type } });
  });
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Form submission route (protected)
app.post('/api/form-submit', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const formData = JSON.stringify(req.body);
  const sql = 'INSERT INTO form_submissions (user_id, form_data) VALUES (?, ?)';
  db.run(sql, [userId, formData], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Form submitted successfully', submissionId: this.lastID });
  });
});

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  const tasks = await Task.find();
  res.json(tasks);
});

// Create new task
app.post('/api/tasks', async (req, res) => {
  const { title, description, budget, deadline } = req.body;
  const task = new Task({ title, description, budget, deadline });
  await task.save();
  res.status(201).json(task);
});

// IntaSend payment endpoint
app.post('/api/pay', async (req, res) => {
  const { amount, taskId } = req.body;
  try {
    const response = await axios.post(
      'https://api.intasend.com/api/v1/checkout/',
      {
        amount,
        currency: 'KES',
        email: 'customer@email.com', // Replace with user's email if available
        // Add other required fields as per IntaSend docs
        redirect_url: `http://localhost:3001/payment-success?taskId=${taskId}`
      },
      {
        headers: {
          'Authorization': 'Bearer YOUR_INTASEND_API_KEY', // Replace with your IntaSend API key
          'Content-Type': 'application/json'
        }
      }
    );
    res.json({ payment_url: response.data.url });
  } catch (err) {
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
