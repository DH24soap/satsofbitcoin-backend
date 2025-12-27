const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// CORS Configuration - Only allow requests from your website
const corsOptions = {
  origin: [
    'https://www.satsofbitcoin.com',
    'https://satsofbitcoin.com',
    'https://satsofbitcoin-frontend.vercel.app',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
};
app.use(cors(corsOptions));

// Parse JSON request bodies
app.use(express.json());

// Rate Limiting - Prevent abuse
// General limiter for all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes per IP
  message: { error: 'Too many requests, please try again later.' }
});

// Scribe limiter for the AI endpoint
const scribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 generations per 15 minutes per IP
  message: { error: 'Too many requests. Please wait a few minutes before generating more.' }
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint to generate polished text
app.post('/api/ask', scribeLimiter, async (req, res) => {
  const { prompt } = req.body;

  // Input validation
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Please provide some text to polish.' });
  }

  if (prompt.length > 5000) {
    return res.status(400).json({ error: 'Text is too long. Please keep it under 5000 characters.' });
  }

  try {
    const veniceResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b',
        messages: [
          {
            role: 'system',
            content: 'You are a professional scribe and writing assistant. Your task is to take the user\'s rough draft or idea and transform it into a polished, well-written, and effective piece of text. Maintain the original intent but improve clarity, tone, and grammar. Only output the final, polished text, nothing else. Do not add any commentary, explanations, or preamble.'
          },
          {
            role: 'user',
            content: prompt.trim()
          }
        ],
        max_tokens: 2000,
      }),
    });

    const data = await veniceResponse.json();

    if (data.choices && data.choices.length > 0) {
      res.json({ answer: data.choices[0].message.content.trim() });
    } else if (data.error) {
      console.error('Venice API Error:', data.error);
      res.status(500).json({ error: 'Failed to generate text. Please try again.' });
    } else {
      res.status(500).json({ error: 'Failed to generate text.' });
    }
  } catch (error) {
    console.error('Error calling Venice API:', error);
    res.status(500).json({ error: 'Internal Server Error. Please try again later.' });
  }
});
// Endpoint to get Bitcoin market data
app.get('/api/market-data', async (req, res) => {
  try {
    const coinGeckoResponse = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_market_cap=true&include_24hr_change=true&include_last_updated_at=true`,
      {
        headers: {
          'x-cg-demo-api-key': process.env.COINGECKO_API_KEY,
        },
      }
    );
    const data = await coinGeckoResponse.json();
    res.json(data);
  } catch (error) {
    console.error('Error calling CoinGecko API:', error);
    res.status(500).json({ error: 'Failed to fetch market data.' });
  }
});
app.listen(PORT, () => {
  console.log(`Anonymous Scribe server is running on port ${PORT}`);
});