/**
 * Aura AI - Complete Backend Server
 * - Gemini API Proxy
 * - Cloudinary Signed Upload
 * Deploy ke Vercel
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================
// MIDDLEWARE
// =====================================

app.use(cors({
  origin: '*', // Allow all origins
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
    message: 'Aura AI - Complete Backend Server',
    version: '1.0.1',
    endpoints: {
      health: 'GET /',
      gemini: 'POST /api/gemini',
      cloudinary: 'POST /api/cloudinary/signature'
    }
  });
});

// Health check (untuk monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// =====================================
// GEMINI API ENDPOINT
// =====================================

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
        
        console.log(`✅ Gemini Success - Response length: ${aiResponse.length} chars`);
        
        return res.json({
          success: true,
          response: aiResponse
        });
      }
    }

    // Invalid response format
    throw new Error('Invalid response format from Gemini API');

  } catch (error) {
    console.error('Error processing Gemini request:', error.message);

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

// =====================================
// CLOUDINARY SIGNED UPLOAD ENDPOINT
// =====================================

app.post('/api/cloudinary/signature', async (req, res) => {
  try {
    const { timestamp } = req.body;
    
    // Validation
    if (!timestamp) {
      return res.status(400).json({ 
        error: 'Timestamp is required' 
      });
    }
    
    // Get credentials from environment variables
    const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
    const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
    
    if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !CLOUD_NAME) {
      console.error('ERROR: Missing Cloudinary credentials');
      return res.status(500).json({ 
        error: 'Server configuration error' 
      });
    }
    
    // Build params to sign
    const paramsToSign = {
      timestamp: timestamp,
      upload_preset: 'aura_chat'
    };
    
    // Sort params alphabetically and create string
    const sortedParams = Object.keys(paramsToSign)
      .sort()
      .map(key => `${key}=${paramsToSign[key]}`)
      .join('&');
    
    // Create SHA-1 signature
    const signature = crypto
      .createHash('sha1')
      .update(sortedParams + CLOUDINARY_API_SECRET)
      .digest('hex');
    
    console.log(`✅ Cloudinary Signature generated successfully`);
    
    res.json({
      success: true,
      signature: signature,
      timestamp: timestamp,
      api_key: CLOUDINARY_API_KEY,
      cloud_name: CLOUD_NAME
    });
    
  } catch (error) {
    console.error('Error generating Cloudinary signature:', error);
    res.status(500).json({ 
      error: 'Failed to generate signature' 
    });
  }
});

// =====================================
// ERROR HANDLERS
// =====================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: {
      health: 'GET /',
      gemini: 'POST /api/gemini',
      cloudinary: 'POST /api/cloudinary/signature'
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

// =====================================
// START SERVER
// =====================================

app.listen(PORT, () => {
  console.log('=================================');
  console.log('✅ Aura AI Backend Server Started');
  console.log('=================================');
  console.log(`Port: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`Cloudinary API Key: ${process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`Cloudinary API Secret: ${process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`Cloudinary Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing'}`);
  console.log('=================================');
});

// For Vercel serverless deployment
module.exports = app;
