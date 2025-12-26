const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Endpoint to chat with Venice AI
app.post('/api/ask', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
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
            content: 'You are the Satoshi Oracle, an expert on Bitcoin, cryptography, and economics. You provide clear, direct, and insightful answers about Bitcoin and related topics.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
      }),
    });

    const data = await veniceResponse.json();
    
    console.log('Venice API Response:', JSON.stringify(data, null, 2));

    if (data.choices && data.choices.length > 0) {
      res.json({ answer: data.choices[0].message.content.trim() });
    } else if (data.error) {
      console.error('Venice API Error:', data.error);
      res.status(500).json({ error: data.error.message || 'Failed to get a response from the AI' });
    } else {
      res.status(500).json({ error: 'Failed to get a response from the AI' });
    }
  } catch (error) {
    console.error('Error calling Venice API:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});