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
  const { prompt, mode } = req.body; // <-- GET THE MODE FROM THE REQUEST

  // Input validation
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'A valid prompt is required.' });
  }
  if (prompt.length > 1000) {
    return res.status(400).json({ error: 'Prompt is too long. Please keep it under 1000 characters.' });
  }

  let systemPrompt;
  let modelToUse;

  // --- DYNAMIC PROMPT AND MODEL SELECTION ---
  if (mode === 'satoshi') {
    systemPrompt = `You are Satoshi Nakamoto. It is the year 2011. You are answering questions about your creation, Bitcoin. You must only use knowledge, reasoning, and information that was available up to and including the year 2010. Do not mention events, technologies, or concepts that emerged after 2010, such as Ethereum, Lightning Network, major exchange collapses, or ETFs. Your tone should be that of a pragmatic, brilliant, and somewhat secretive cypherpunk. Focus on the core principles of decentralization, proof-of-work, and solving the double-spend problem.`;
    modelToUse = 'hermes-3-llama-3.1-405b'; // Use the powerful, slower model
  } else {
    systemPrompt = `You are the Satoshi Oracle, an expert on Bitcoin, cryptography, and economics. You provide clear, direct, and insightful answers about Bitcoin and related topics.`;
    modelToUse = 'llama-3.3-70b'; // Use the fast, standard model
  }

  try {
    const veniceResponse = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelToUse, // <-- USE THE DYNAMIC MODEL VARIABLE
        messages: [
          { role: 'system', content: systemPrompt }, // <-- USE THE DYNAMIC PROMPT VARIABLE
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
// =================================================================
// --- CORRECTED ENDPOINT FOR THE ASSET CALCULATOR ---
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
    const fcsUrl = `https://fcsapi.com/api-v3/forex/latest?symbol=XAG/USD&access_key=${fcsApiKey}`;
    const fcsResponse = await axios.get(fcsUrl);
    const fcsData = fcsResponse.data;

    // 3. Construct a clean, predictable response for our frontend
    const prices = {
      bitcoin: {
        usd: parseFloat(twelveData['BTC/USD'].price),
      },
      gold: {
        price_per_ounce_usd: parseFloat(twelveData['XAU/USD'].price),
      },
      silver: {
        // --- CORRECTED: Check for 'status: true' which indicates success from FCSAPI ---
        price_per_ounce_usd: (fcsData.status === true && fcsData.response && fcsData.response.length > 0) 
          ? parseFloat(fcsData.response[0].c) // --- CORRECTED: The closing price is in the 'c' field
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