/// middlewares/isAdmin.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super‑demo‑secret'; // Replace with your actual secret

module.exports = function isAdmin(req, res, next) {
  // Check if user is already populated by a previous auth middleware
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  // If not, try to decode the token directly
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.role === 'admin') {
      req.user = decoded; // populate req.user in case it wasn’t before
      return next();
    } else {
      return res.status(403).json({ error: 'Admin access only' });
    }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
