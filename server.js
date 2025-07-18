require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger/swaggerSpec');
const connectDB = require('./config/db');

const { authenticate } = require('./middleware/auth');
const deviceLock = require('./middleware/deviceLock');

// Connect to DB
connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Swagger Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Public Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/course'));
app.use('/api/otp', require('./routes/totp'));

// Protected Routes
app.use('/api/video', authenticate, deviceLock, require('./routes/video'));

// Test Route
app.get('/', (req, res) => {
  res.send('Welcome to Prep360 Backend!');
});

// 404 Route
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
