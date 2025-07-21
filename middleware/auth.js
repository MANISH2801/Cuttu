// middleware/auth.js
//
// ▸ authenticate : verifies JWT and attaches req.user
// ▸ authorize(...roles) : role-based guard
// -------------------------------------------------

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// JWT verification middleware
function authenticate(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.replace(/^Bearer\s+/i, '');

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET); // payload: { id, role, deviceId, ... }
    return next();
  } catch (err) {
    console.error('[auth]', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Role-based guard
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || (roles.length && !roles.includes(req.user.role))) {
      return res.status(403).json({ error: 'Forbidden – Access denied' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };