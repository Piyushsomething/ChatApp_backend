// File: server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  let userId;

  ws.on('message', async (message) => {
    console.log('Received:', message);
    
    try {
      const parsedMessage = JSON.parse(message);
      userId = parsedMessage.userId;
      
      // Save the user's message to the database
      await prisma.message.create({
        data: {
          content: parsedMessage.content,
          userId: userId,
          isFromServer: false,
        },
      });
      
      // Create and save the server's response
      const serverResponse = {
        content: parsedMessage.content, // Echo the same content
        userId: userId,
        isFromServer: true,
      };
      
      await prisma.message.create({
        data: serverResponse,
      });
      
      // Send the server's response back to the client
      ws.send(JSON.stringify(serverResponse));
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// User registration
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });
    res.json({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed' });
  }
});

// User login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);
    res.json({ token, userId: user.id });
  } catch (error) {
    res.status(400).json({ error: 'Login failed' });
  }
});

// Get chat history for a specific user
app.get('/messages/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const messages = await prisma.message.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(messages);
  } catch (error) {
    res.status(400).json({ error: 'Failed to fetch messages' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});