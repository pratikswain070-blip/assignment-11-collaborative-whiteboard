/**
 * Express & Socket.io Server Bootstrap
 * Assignment 11: Real-Time Collaborative Whiteboard & Canvas (Socket.io)
 * Student: Pratik Swain (150096725184)
 */

require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const { boardRooms, handleBoardEvents } = require('./sockets/boardHandler');
const { handleCursorEvents } = require('./sockets/cursorHandler');

const app = express();
const server = http.createServer(app);

// Environment Configuration
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Middleware
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// REST Endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    message: 'Collaborative Whiteboard WebSocket Server is running'
  });
});

app.get('/api/rooms', (req, res) => {
  const summary = Object.entries(boardRooms).map(([roomId, room]) => ({
    boardId: roomId,
    strokeCount: room.strokes.length,
    activeUserCount: Object.keys(room.users).length,
    users: Object.values(room.users).map(u => ({ username: u.username, color: u.color }))
  }));
  res.status(200).json({ rooms: summary });
});

app.get('/api/rooms/:boardId', (req, res) => {
  const roomId = req.params.boardId;
  const room = boardRooms[roomId];
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.status(200).json({
    boardId: room.boardId,
    strokeCount: room.strokes.length,
    activeUsers: Object.values(room.users)
  });
});

// Serve frontend for all unmatched GET requests (SPA friendly)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize Socket.io Server
const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 30000,
  pingInterval: 25000
});

// Socket Connection Lifecycle
io.on('connection', (socket) => {
  // Attach modular handlers
  handleBoardEvents(io, socket);
  handleCursorEvents(io, socket);
});

// Start Server
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🎨 Real-Time Whiteboard Server Running on port ${PORT}`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`👨‍💻 Student: Pratik Swain (150096725184)`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, server, io };
