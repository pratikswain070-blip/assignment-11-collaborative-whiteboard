/**
 * Cursor Handler - High-Frequency Live Collaborator Cursor Tracking
 * Assignment 11: Real-Time Collaborative Whiteboard & Canvas (Socket.io)
 * Student: Pratik Swain (150096725184)
 */

const { boardRooms } = require('./boardHandler');

/**
 * Register cursor tracking events on socket
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function handleCursorEvents(io, socket) {
  // High-frequency mouse pointer sync
  socket.on('cursor:move', ({ boardId, x, y }) => {
    const roomId = boardId || socket.data.boardId;
    if (!roomId) return;

    // Update in-memory room cursor coordinates
    if (boardRooms[roomId] && boardRooms[roomId].users[socket.id]) {
      boardRooms[roomId].users[socket.id].cursor = { x, y };
    }

    // Relay peer cursor position to other room participants
    socket.to(roomId).emit('cursor:update', {
      userId: socket.id,
      x,
      y,
      username: socket.data.username || 'Collaborator',
      color: socket.data.userColor || '#3b82f6'
    });
  });
}

module.exports = {
  handleCursorEvents
};
