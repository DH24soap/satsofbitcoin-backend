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
    const veniceResponse = await fetch('https://api.venice.ai/api/v1/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.VENICE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'claude-opus-4.5',
        prompt: `You are the Satoshi Oracle, an expert on Bitcoin, cryptography, and economics. You provide clear, direct, and insightful answers. Answer the following question: ${prompt}`,
        max_tokens: 500,
      }),
    });

    const data = await veniceResponse.json();
    if (data.choices && data.choices.length > 0) {
      res.json({ answer: data.choices[0].text.trim() });
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
    const coinGeckoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_market_cap=true&include_24hr_change=true&include_last_updated_at=true`, {
      headers: {
        'x-cg-demo-api-key': process.env.COINGECKO_API_KEY,
      },
    });

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