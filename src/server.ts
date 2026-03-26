import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

pool.connect()
  .then((client) => {
    console.log('Connected to AWS PostgreSQL');
    client.release();
  })
  .catch((err) => {
    console.error('AWS connection error:', err);
  });

const isValidEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const getClientIp = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0];
  }

  return req.socket.remoteAddress || 'unknown';
};

app.get('/', (_req: Request, res: Response) => {
  res.send('Portfolio API is running');
});

app.post('/api/contact', async (req: Request, res: Response) => {
  const { name, email, message } = req.body;

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedMessage = String(message || '').trim();
  const trimmedName = name ? String(name).trim() : null;
  const ipAddress = getClientIp(req);

  if (!normalizedEmail || !trimmedMessage) {
    return res.status(400).json({
      success: false,
      error: 'Email and message are required',
    });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format',
    });
  }

  try {
    // 1 submission per 60 seconds per IP
    const ipCooldownResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM contact_messages
      WHERE ip_address = $1
        AND created_at > NOW() - INTERVAL '60 seconds'
      `,
      [ipAddress]
    );

    if (ipCooldownResult.rows[0].count >= 1) {
      return res.status(429).json({
        success: false,
        blocked: true,
        error: 'Please wait before sending another message.',
        retryAfterSeconds: 60,
      });
    }

    // Max 5 submissions per 15 minutes per IP
    const ipWindowResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM contact_messages
      WHERE ip_address = $1
        AND created_at > NOW() - INTERVAL '15 minutes'
      `,
      [ipAddress]
    );

    if (ipWindowResult.rows[0].count >= 5) {
      return res.status(429).json({
        success: false,
        blocked: true,
        error: 'Too many submissions from this network. Please try again later.',
        retryAfterSeconds: 900,
      });
    }

    // Max 3 submissions per 12 hours per email
    const emailWindowResult = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM contact_messages
      WHERE LOWER(email) = $1
        AND created_at > NOW() - INTERVAL '12 hours'
      `,
      [normalizedEmail]
    );

    if (emailWindowResult.rows[0].count >= 3) {
      return res.status(429).json({
        success: false,
        blocked: true,
        error: 'This email has reached the submission limit. Please try again later.',
        retryAfterSeconds: 43200,
      });
    }

    await pool.query(
      `
      INSERT INTO contact_messages (name, email, message, ip_address)
      VALUES ($1, $2, $3, $4)
      `,
      [trimmedName, normalizedEmail, trimmedMessage, ipAddress]
    );

    return res.status(200).json({
      success: true,
      message: 'Contact form submitted successfully',
    });
  } catch (err) {
    console.error('Database error:', err);

    return res.status(500).json({
      success: false,
      error: 'Database error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});