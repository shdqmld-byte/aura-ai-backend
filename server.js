/**
 * Aura AI - Gemini API Proxy Server
 * Deploy ke Railway.app atau Render.com
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*', // Allow all origins (bisa dibatasi nanti)
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// =====================================
// ROUTES
// =====================================

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Aura AI - Gemini API Proxy Server',
    version: '1.0.0',
    endpoints: {
      health: 'GET /',
      gemini: 'POST /api/gemini'
    }
  });
});

// Health check (untuk Railway monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Main Gemini API endpoint
app.post('/api/gemini', async (req, res) => {
  try {
    const { message, image, userId } = req.body;

    // Validation
    if (!message) {
      return res.status(400).json({
        error: 'Message is required'
      });
    }

    if (typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message must be a string'
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        error: 'Message too long (max 5000 characters)'
      });
    }

    // Check API key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error('ERROR: GEMINI_API_KEY not set in environment variables');
      return res.status(500).json({
        error: 'Server configuration error'
      });
    }

    // Build request body for Gemini
    const parts = [];

    // Add image first if exists
    if (image) {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: image
        }
      });
    }

    // Add text message
    parts.push({
      text: message
    });

    const requestBody = {
      contents: [{
        parts: parts
      }]
    };

    // Call Gemini API
    const MODEL = 'gemini-2.0-flash-exp';
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    console.log(`Calling Gemini API for user: ${userId || 'anonymous'}`);

    const response = await axios.post(API_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 seconds
    });

    // Parse response
    if (response.data.candidates && response.data.candidates.length > 0) {
      const candidate = response.data.candidates[0];
      
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const aiResponse = candidate.content.parts[0].text;
        
        console.log(`✅ Success - Response length: ${aiResponse.length} chars`);
        
        return res.json({
          success: true,
          response: aiResponse
        });
      }
    }

    // Invalid response format
    throw new Error('Invalid response format from Gemini API');

  } catch (error) {
    console.error('Error processing request:', error.message);

    // Handle Axios errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;

      console.error(`Gemini API Error ${status}:`, errorData);

      // Rate limit
      if (status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Please try again later.'
        });
      }

      // Bad request
      if (status === 400) {
        return res.status(400).json({
          error: 'Invalid request to AI service'
        });
      }

      // Forbidden
      if (status === 403) {
        return res.status(403).json({
          error: 'API access denied. Please check API key.'
        });
      }

      // Other API errors
      return res.status(status).json({
        error: `AI service error: ${status}`
      });
    }

    // Timeout
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        error: 'Request timeout. Please try again.'
      });
    }

    // Generic error
    res.status(500).json({
      error: 'Failed to process request. Please try again later.'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: {
      health: 'GET /',
      gemini: 'POST /api/gemini'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('=================================');
  console.log('✅ Aura AI Proxy Server Started');
  console.log('=================================');
  console.log(`Port: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log('=================================');
});

// For Vercel serverless deployment
module.exports = app;