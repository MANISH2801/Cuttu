// ───────────────────────── server.js ─────────────────────────
// Express + JWT‑secured backend for Prep360 with Swagger docs
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'super‑demo‑secret';

const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const Joi        = require('joi');
const pool       = require('./db');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const totpRoutes      = require('./routes/totp');
const pwResetRoutes   = require('./routes/passwordReset');
const enrollmentRoutes= require('./routes/enrollments');
const videosRoutes    = require('./routes/videos');
const dashboardRoutes = require('./routes/dashboard');
const deviceLock      = require('./middlewares/deviceLock');
const { authenticate:authMiddleware} = require('./middlewares/auth');
const isAdmin = require('./middlewares/isAdmin');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://boisterous-liger-61259d.netlify.app',
  credentials: true
}));


// ─────────── SWAGGER TAGS (top‑level) ───────────
/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication & session
 *   - name: Users
 *     description: User records
 *   - name: Courses
 *     description: Course catalogue (admin write)
 *   - name: Enrollments
 *     description: Course enrollments
 */

// ─────────────────── ROUTES ───────────────────
// ─────────── REUSABLE MIDDLEWARE ───────────
function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Token required' });
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Contains { id, device_id }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
// ✔ Admin‑only
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// ✔ The logged‑in user *or* an admin
function requireSelfOrAdmin(paramKey = 'user_id') {
  return (req, res, next) => {
    const target = +req.params[paramKey] || +req.body[paramKey];
    if (req.user.role === 'admin' || req.user.id === target) return next();
    return res.status(403).json({ error: 'Not allowed' });
  };
}

/**
 * @swagger
 * /:
 *   get:
 *     tags: [Auth]
 *     summary: Health‑check
 *     responses:
 *       200:
 *         description: API is alive
 */
app.get('/', (_req, res) => res.send('Prep360 backend ✅'));

/* ---------- USERS ---------- */

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (safe subset)
 *     responses:
 *       200:
 *         description: Array of users
 */
app.get('/users', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, email, role, is_verified, is_logged_in, created_at
      FROM   users
      ORDER  BY id`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ---------- REGISTER ---------- */
/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Auth]
 *     summary: Create a new user account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       201: { description: Registered }
 *       409: { description: Email already exists }
 */
app.post('/register', async (req, res) => {
  const schema = Joi.object({
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required()
  });

  const { error, value } = schema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  const { username, email, password } = value;
  const user_type = 'normal'; // ✅ allowed by DB
 // Must match your CHECK CONSTRAINT exactly

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const insertQuery = `
      INSERT INTO users (username, email, password, role, user_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, username, email, role, is_verified, is_logged_in, user_type
    `;

    const { rows } = await pool.query(insertQuery, [
      username,
      email,
      hashedPassword,
      'normal',
      user_type
    ]);

    res.status(201).json({
      message: '✅ Registration successful',
      user: rows[0]
    });

  } catch (err) {
    console.error("❌ Registration Error:", err.message);
    if (err.code === '23514') { // PostgreSQL CHECK constraint violation
      return res.status(400).json({
        error: 'Invalid user_type: must be one of the allowed values'
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});




/* ---------- LOGIN ---------- */
/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in & receive JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, device_id]
 *             properties:
 *               email:     { type: string, format: email }
 *               password:  { type: string }
 *               device_id: { type: string }
 *     responses:
 *       200: { description: JWT token + user }
 *       401: { description: Invalid credentials }
 */
app.post('/login', async (req, res) => {
  const { email, password, device_id } = req.body;
  console.log("➡️ Login attempt:", { email, device_id });

  if (!email || !password || !device_id) {
    return res.status(400).json({ error: 'email, password and device_id are required' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

// Inside /login route:
if (!user.totp_secret) {
  const secret = speakeasy.generateSecret({ name: `Prep360 (${user.email})` });
  await pool.query(
    'UPDATE users SET totp_secret = $1, totp_enabled = false, is_verified = false WHERE id = $2',
    [secret.base32, user.id]
  );
 user.totp_secret = secret.base32;
user.qrImage = await qrcode.toDataURL(secret.otpauth_url); // ✅ generate QR

}


    // ❌ If 2FA required but not verified, skip login and redirect to verify
    if (user.totp_secret && !user.is_verified) {
      const token = jwt.sign({ id: user.id, device_id }, JWT_SECRET, { expiresIn: '7d' });

      return res.json({
        message: '2FA required',
        requires_2fa: true,
        token,
        qr_image_url: user.qrImage, // ✅ send QR image to frontend
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          user_type: user.user_type,
          role: user.role,
        }
      });
    }

    // ✅ Fully verified, issue token
    await pool.query(
      'UPDATE users SET is_logged_in = true, device_id = $1 WHERE id = $2',
      [device_id, user.id]
    );

    const token = jwt.sign({ id: user.id, device_id }, JWT_SECRET, { expiresIn: '7d' });

    const { password: pwd, ...safeUser } = user;

    
    return res.json({
      message: 'Login successful ✅',
      token,
      requires_2fa: false,
      user: safeUser
    });

  } catch (err) {
    console.error('🔥 Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});





/* ---------- LOGOUT ---------- */
/**
 * @swagger
 * /logout:
 *   post:
 *     tags: [Auth]
 *     summary: Force‑logout a user (clears device id)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id: { type: integer }
 *     responses:
 *       200: { description: Logged‑out }
 */
app.post('/logout', authMiddleware, async (req, res) => {

  try {
    const userId = req.user.id; // From JWT

    await pool.query(
      'UPDATE users SET is_logged_in = false, device_id = NULL WHERE id = $1',
      [userId]
    );

    res.status(200).json({ message: 'Logged out successfully ✅' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Server error during logout' });
  }
});


/* ---------- WHO AM I (Protected) ---------- */
/**
 * @swagger
 * /me:
 *   get:
 *     tags: [Users]
 *     security: [bearerAuth: []]
 *     summary: Get current user info
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Not authenticated }
 */

app.get("/me", authMiddleware, async (req, res) => {

  try {
    const { id } = req.user; // ✅ Comes from JWT

    const result = await pool.query(
      "SELECT id, email, role, device_id, is_logged_in, username FROM users WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(result.rows[0]); // ✅ Sends dynamic user data
  } catch (err) {
    console.error("Error in /me:", err);
    res.status(500).json({ message: "Server error" });
  }
});


/* ---------- COURSES ---------- */

/**
 * @swagger
 * /courses:
 *   get:
 *     tags: [Courses]
 *     summary: List all courses
 *     responses:
 *       200: { description: Array of courses }
 */
app.get('/courses', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM courses ORDER BY id');
  res.json(rows);
});

// ─────────────────────────────── COURSE BY ID (with role-based access) ───────────────────────────────
/**
 * @swagger
 * /courses/{id}:
 *   get:
 *     summary: Get full or preview version of course
 *     tags: [Courses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Course ID
 *     responses:
 *       200:
 *         description: Course object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Course not found
 */
app.get('/courses/:id', auth, async (req, res) => {
  const courseId = req.params.id;
  const userId = req.user.id;

  try {
    const { rows: courseRows } = await pool.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );
    const course = courseRows[0];
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const { rows: userRows } = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [userId]
    );
    const user = userRows[0];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // ✅ Admin gets full access
     if (user.role === 'admin') {
  return res.json({ ...course, enrolled: true, role: 'admin' });
}

    // ✅ Regular user? Check enrollment
    const { rows: enrolled } = await pool.query(
      'SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2',
      [userId, courseId]
    );

    if (enrolled.length > 0) {
  return res.json({ ...course, enrolled: true, role: user.role });
}


    // ❌ Not enrolled — return limited version
    const limitedCourse = {
  id: course.id,
  title: course.title,
  description: course.description,
  price: course.price,
  first_video: course.first_video,
  enrolled: false,
  message: 'Upgrade to access full content',
  role: user.role
};


    return res.json(limitedCourse);

  } catch (err) {
    console.error('❌ Error in course access:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});



/**
 * @swagger
 * /courses:
 *   post:
 *     tags: [Courses]
 *     security: [bearerAuth: []]
 *     summary: Create a new course  _(admin)_
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, price]
 *             properties:
 *               title:             { type: string }
 *               description:       { type: string }
 *               price:             { type: number }
 *               first_video_link:  { type: string }
 *               live_video_link:   { type: string }
 *               archived_video_link:{ type: string }
 *     responses:
 *       201: { description: Created }
 *       403: { description: Not admin }
 */
app.post('/courses', auth, requireAdmin, async (req, res) => {
  const { title, description, price,
          first_video_link, live_video_link, archived_video_link } = req.body;
  if (!title || !description || !price)
    return res.status(400).json({ error: 'Missing course fields' });

  const { rows } = await pool.query(`
    INSERT INTO courses (title,description,price,
                         first_video_link,live_video_link,archived_video_link)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [title,description,price,first_video_link,live_video_link,archived_video_link]);
  res.status(201).json({ message: 'Course created ✅', course: rows[0] });
});

/**
 * @swagger
 * /courses/{id}:
 *   put:
 *     tags: [Courses]
 *     security: [bearerAuth: []]
 *     summary: Update a course  _(admin)_
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Course'   # same fields
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 */
app.put('/courses/:id', auth, requireAdmin, async (req, res) => {
  const { title, description, price,
          first_video_link, live_video_link, archived_video_link } = req.body;
  const { rows } = await pool.query(`
    UPDATE courses SET
      title=$1, description=$2, price=$3,
      first_video_link=$4, live_video_link=$5, archived_video_link=$6
    WHERE id=$7 RETURNING *`,
    [title,description,price,first_video_link,live_video_link,archived_video_link,req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Course not found' });
  res.json({ message: 'Course updated ✅', course: rows[0] });
});

/**
 * @swagger
 * /courses/{id}:
 *   delete:
 *     tags: [Courses]
 *     security: [bearerAuth: []]
 *     summary: Delete a course  _(admin)_
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
app.delete('/courses/:id', auth, requireAdmin, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM courses WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Course not found' });
  res.json({ message: 'Course deleted ✅', deleted_course_id: req.params.id });
});
          
/* ---------- ENROLLMENTS ---------- */

/**
 * @swagger
 * /enroll:
 *   post:
 *     tags: [Enrollments]
 *     security: [bearerAuth: []]
 *     summary: Enroll current user in a course
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, course_id]
 *             properties:
 *               user_id:   { type: integer }
 *               course_id: { type: integer }
 *     responses:
 *       201: { description: Enrolled }
 *       409: { description: Already enrolled }
 */
app.post('/enroll', auth, requireSelfOrAdmin('user_id'), async (req, res) => {
  const { user_id, course_id } = req.body;
  const dup = await pool.query(
    'SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2',
    [user_id, course_id]);
  if (dup.rowCount) return res.status(409).json({ error: 'Already enrolled' });

  const { rows } = await pool.query(`
    INSERT INTO enrollments (user_id,course_id)
    VALUES ($1,$2) RETURNING *`, [user_id, course_id]);
  res.status(201).json({ message: 'Enrolled ✅', enrollment: rows[0] });
});

/**
 * @swagger
 * /enrollments/{user_id}:
 *   get:
 *     tags: [Enrollments]
 *     security: [bearerAuth: []]
 *     summary: Get all courses a user is enrolled in
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Array of courses }
 */
app.get('/enrollments/:user_id', auth, requireSelfOrAdmin('user_id'), async (req, res) => {
  const { user_id } = req.params;
  const { rows } = await pool.query(`
    SELECT c.* FROM enrollments e
    JOIN courses c ON c.id=e.course_id
    WHERE e.user_id=$1`, [user_id]);
  res.json({ user_id, courses: rows });
});

/**
 * @swagger
 * /enrollments/{user_id}/{course_id}:
 *   delete:
 *     tags: [Enrollments]
 *     security: [bearerAuth: []]
 *     summary: Unenroll a user from a course
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: course_id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Unenrolled }
 *       404: { description: Not found }
 */
app.delete('/enrollments/:user_id/:course_id',
  auth, requireSelfOrAdmin('user_id'), async (req, res) => {

  const { user_id, course_id } = req.params;
  const { rowCount } = await pool.query(
    'DELETE FROM enrollments WHERE user_id=$1 AND course_id=$2',
    [user_id, course_id]);
  if (!rowCount) return res.status(404).json({ error: 'Enrollment not found' });

  res.json({ message: 'Unenrolled ✅' });
});


// ─────────────────── Added feature routes ───────────────────
app.use('/auth/2fa', auth, totpRoutes);
app.use('/auth', pwResetRoutes); // includes request-password-reset & reset-password
app.use('/courses', auth, deviceLock, enrollmentRoutes); // enrollment endpoints
// 👇 Allow all authenticated users to fetch videos
app.use('/courses', auth, deviceLock, videosRoutes); 
// 👇 Allow only admin to add/delete/update videos (handled inside videos.js)
 // video endpoints (admin)
app.use('/courses', auth, deviceLock, requireAdmin, videosRoutes);
app.use('/admin/dashboard', auth, deviceLock, requireAdmin, dashboardRoutes);


// ─────────────── Swagger docs served at /docs ───────────────
// Serve Swagger docs at /api-docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/payments', require('./routes/payment'));
app.use('/chapters', require('./routes/chapters'));
app.use('/lessons', require('./routes/lessons'));

// ─────────────── Start server ───────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀  Listening on ${PORT}`));

/* ------------- Swagger COMPONENTS (optional) -------------
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Course:
 *       type: object
 *       required: [title,description,price]
 *       properties:
 *         title:  { type: string }
 *         description: { type: string }
 *         price: { type: number }
 *         first_video_link:  { type: string }
 *         live_video_link:   { type: string }
 *         archived_video_link:{ type: string }
 * ----------------------------------------------------------*/