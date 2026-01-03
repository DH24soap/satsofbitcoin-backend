const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
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
  max: 100, // 100 requests per 15 minutes per IP
  message: { error: 'Too many requests, please try again later.' }
});

// Stricter limiter for the AI endpoint (more expensive)
const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 AI requests per 15 minutes per IP
  message: { error: 'Too many questions asked. Please wait a few minutes before asking more.' }
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint to chat with Venice AI
app.post('/api/ask', askLimiter, async (req, res) => {
  const { prompt } = req.body;

  // Input validation
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'A valid prompt is required.' });
  }
  if (prompt.length > 1000) {
    return res.status(400).json({ error: 'Prompt is too long. Please keep it under 1000 characters.' });
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
          { role: 'system', content: 'You are the Satoshi Oracle, an expert on Bitcoin, cryptography, and economics. You provide clear, direct, and insightful answers about Bitcoin and related topics.' },
          { role: 'user', content: prompt.trim() }
        ],
        max_tokens: 500,
      }),
    });

    const data = await veniceResponse.json();

    if (data.choices && data.choices.length > 0) {
      res.json({ answer: data.choices[0].message.content.trim() });
    } else if (data.error) {
      console.error('Venice API Error:', data.error);
      res.status(500).json({ error: 'Failed to get a response from the AI. Please try again.' });
    } else {
      res.status(500).json({ error: 'Failed to get a response from the AI.' });
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

// =================================================================
// --- UPDATED ENDPOINT FOR THE ASSET CALCULATOR ---
// =================================================================
app.get('/api/asset-prices', async (req, res) => {
  try {
    const twelveDataKey = process.env.TWELVEDATA_API_KEY;
    const fcsApiKey = process.env.FCSAPI_API_KEY;

    if (!twelveDataKey || !fcsApiKey) {
      return res.status(500).json({ error: 'API keys are not configured on the server.' });
    }

    // 1. Fetch Bitcoin and Gold from Twelve Data
    const twelveDataSymbols = 'BTC/USD,XAU/USD';
    const twelveDataUrl = `https://api.twelvedata.com/price?symbol=${twelveDataSymbols}&apikey=${twelveDataKey}`;
    const twelveResponse = await axios.get(twelveDataUrl);
    const twelveData = twelveResponse.data;

    if (twelveData.status && twelveData.status === 'error') {
        console.error('Twelve Data API Error:', twelveData.message);
        return res.status(500).json({ error: 'Failed to fetch data from Twelve Data.' });
    }

    // 2. Fetch Silver from FCSAPI
    const fcsUrl = `https://fcsapi.com/api-v3/forex/latest?symbol=XAGUSD&access_key=${fcsApiKey}`;
    const fcsResponse = await axios.get(fcsUrl);
    const fcsData = fcsResponse.data;

    if (fcsData.status !== 'ok') {
        console.error('FCSAPI Error:', fcsData);
        // If FCSAPI fails, we can still return the other data, but silver will be null
        console.log('FCSAPI failed, proceeding with null silver price.');
    }

    // 3. Construct a clean, predictable response for our frontend
    const prices = {
      bitcoin: {
        usd: parseFloat(twelveData['BTC/USD'].price),
      },
      gold: {
        price_per_ounce_usd: parseFloat(twelveData['XAU/USD'].price),
      },
      silver: {
        // The FCSAPI response structure is different. We need to check if it was successful.
        price_per_ounce_usd: (fcsData.status === 'ok' && fcsData.response && fcsData.response.length > 0) 
          ? parseFloat(fcsData.response[0].price) 
          : null,
      },
    };

    res.json(prices);

  } catch (error) {
    console.error('Error in /api/asset-prices:', error.message);
    res.status(500).json({ error: 'An internal server error occurred while fetching asset prices.' });
  }
});


app.listen(PORT, () => {
  console.log(`Satoshi Oracle server is running on port ${PORT}`);
});