/**
 * Board Handler - In-Memory Whiteboard Store & Event Protocols
 * Assignment 11: Real-Time Collaborative Whiteboard & Canvas (Socket.io)
 * Student: Pratik Swain (150096725184)
 */

// In-Memory Whiteboard Store
// Structure: Map of boardId -> { boardId, strokes: [], users: {} }
const boardRooms = {};

/**
 * Helper to get or initialize a room
 * @param {string} boardId
 * @returns {object} room object
 */
function getOrCreateRoom(boardId) {
  if (!boardRooms[boardId]) {
    boardRooms[boardId] = {
      boardId,
      strokes: [],
      users: {}
    };
  }
  return boardRooms[boardId];
}

/**
 * Register board events on socket
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function handleBoardEvents(io, socket) {
  // 1. Join Board Room
  socket.on('board:join', ({ boardId, username, userColor }) => {
    const roomId = (boardId || 'default').trim();
    const clientUsername = (username || `User_${socket.id.slice(0, 4)}`).trim();
    const color = userColor || '#3b82f6';

    // Leave previous room if any
    if (socket.data.boardId && socket.data.boardId !== roomId) {
      const prevRoomId = socket.data.boardId;
      socket.leave(prevRoomId);
      if (boardRooms[prevRoomId] && boardRooms[prevRoomId].users[socket.id]) {
        delete boardRooms[prevRoomId].users[socket.id];
        socket.to(prevRoomId).emit('user:left', {
          userId: socket.id,
          username: socket.data.username
        });
      }
    }

    // Join new room
    socket.join(roomId);
    socket.data.boardId = roomId;
    socket.data.username = clientUsername;
    socket.data.userColor = color;

    const room = getOrCreateRoom(roomId);
    room.users[socket.id] = {
      username: clientUsername,
      color,
      cursor: { x: 0, y: 0 }
    };

    // Emit complete stroke history and active users to newly joined peer
    const activeUsers = Object.entries(room.users).map(([userId, u]) => ({
      userId,
      username: u.username,
      color: u.color
    }));

    socket.emit('board:init', {
      strokes: room.strokes,
      activeUsers
    });

    // Notify other participants in the board room
    socket.to(roomId).emit('user:joined', {
      userId: socket.id,
      username: clientUsername,
      color
    });
  });

  // 2. Draw Stroke Stream
  socket.on('draw:stroke', ({ boardId, stroke }) => {
    const roomId = boardId || socket.data.boardId;
    if (!roomId || !stroke) return;

    const room = getOrCreateRoom(roomId);

    // Normalize stroke object
    const strokeData = {
      ...stroke,
      authorId: socket.id,
      timestamp: Date.now()
    };

    // Append to server-side history buffer
    room.strokes.push(strokeData);

    // Relay drawing stroke to all other participants in the room
    socket.to(roomId).emit('draw:broadcast', {
      stroke: strokeData
    });
  });

  // 3. Clear Canvas
  socket.on('board:clear', ({ boardId }) => {
    const roomId = boardId || socket.data.boardId;
    if (!roomId) return;

    const room = getOrCreateRoom(roomId);
    room.strokes = [];

    // Notify all room peers to wipe their local canvas
    io.to(roomId).emit('board:cleared', {
      clearedBy: socket.data.username || 'Collaborator'
    });
  });

  // 4. Draw Undo (State Rollback)
  socket.on('draw:undo', ({ boardId }) => {
    const roomId = boardId || socket.data.boardId;
    if (!roomId) return;

    const room = getOrCreateRoom(roomId);
    if (!room.strokes || room.strokes.length === 0) return;

    // Continuous stroke rollback:
    // If strokes have strokeId, remove all segments of the last continuous stroke action
    const lastStroke = room.strokes[room.strokes.length - 1];
    if (lastStroke && lastStroke.strokeId) {
      const targetStrokeId = lastStroke.strokeId;
      room.strokes = room.strokes.filter(s => s.strokeId !== targetStrokeId);
    } else {
      room.strokes.pop();
    }

    // Broadcast updated state snapshot after undo
    io.to(roomId).emit('board:sync', {
      strokes: room.strokes
    });
  });

  // 5. Peer Disconnect Clean-up
  socket.on('disconnect', () => {
    const roomId = socket.data.boardId;
    if (roomId && boardRooms[roomId] && boardRooms[roomId].users[socket.id]) {
      const user = boardRooms[roomId].users[socket.id];
      delete boardRooms[roomId].users[socket.id];

      // Broadcast user departure to room
      socket.to(roomId).emit('user:left', {
        userId: socket.id,
        username: socket.data.username || user.username
      });
    }
  });
}

module.exports = {
  boardRooms,
  getOrCreateRoom,
  handleBoardEvents
};
