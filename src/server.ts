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

app.get('/', (_req: Request, res: Response) => {
  res.send('Portfolio API is running');
});

app.post('/api/contact', async (req: Request, res: Response) => {
  const { name, email, message } = req.body;

  if (!email || !message) {
    return res.status(400).json({
      success: false,
      error: 'Email and message are required',
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format',
    });
  }

  try {
    await pool.query(
      'INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)',
      [name || null, email, message]
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