/**
 * Automated End-to-End WebSocket Test Suite for Assignment 11
 * Student: Pratik Swain (150096725184)
 * Tests:
 *  1. Socket.io Connection & Multi-Room Partitioning
 *  2. Real-Time Stroke Streaming & History Buffer Sync (board:init, draw:stroke, draw:broadcast)
 *  3. Live Collaborator Cursor Tracking (cursor:move, cursor:update)
 *  4. Coordinated Rollback (draw:undo -> board:sync)
 *  5. Canvas Reset (board:clear -> board:cleared)
 *  6. Multi-tenant Room Isolation
 *  7. Peer Disconnect Handling (user:left)
 */

const { io: Client } = require('socket.io-client');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const { boardRooms, handleBoardEvents } = require('./sockets/boardHandler');
const { handleCursorEvents } = require('./sockets/cursorHandler');

let server;
let ioServer;
let port;
let serverUrl;

function setupTestServer() {
  return new Promise((resolve) => {
    const app = express();
    server = http.createServer(app);
    ioServer = new Server(server, { cors: { origin: '*' } });

    ioServer.on('connection', (socket) => {
      handleBoardEvents(ioServer, socket);
      handleCursorEvents(ioServer, socket);
    });

    server.listen(0, () => {
      port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      resolve();
    });
  });
}

function teardownTestServer() {
  return new Promise((resolve) => {
    ioServer.close(() => {
      server.close(resolve);
    });
  });
}

function createClient(username, color) {
  return new Promise((resolve) => {
    const socket = Client(serverUrl, {
      transports: ['websocket'],
      forceNew: true
    });
    socket.on('connect', () => {
      resolve(socket);
    });
  });
}

async function runTestSuite() {
  console.log('🧪 ========================================================');
  console.log('🧪 Starting Assignment 11 Automated Real-Time Test Suite');
  console.log('🧪 Student: Pratik Swain (150096725184)');
  console.log('🧪 ========================================================\n');

  await setupTestServer();
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      process.exitCode = 1;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Room Join & board:init & user:joined
    // -------------------------------------------------------------
    console.log('👉 [Test 1] Socket.io Connection & Multi-Room Management:');
    const client1 = await createClient('Alice', '#ff5722');
    const client2 = await createClient('Bob', '#3b82f6');
    const clientRoomB = await createClient('Charlie', '#10b981');

    const client1InitPromise = new Promise((resolve) => {
      client1.once('board:init', (data) => resolve(data));
    });

    client1.emit('board:join', {
      boardId: 'DESIGN_101',
      username: 'Alice',
      userColor: '#ff5722'
    });

    const initData1 = await client1InitPromise;
    assert(Array.isArray(initData1.strokes) && initData1.strokes.length === 0, 'Client 1 received empty stroke history on initial room creation');
    assert(initData1.activeUsers.length === 1 && initData1.activeUsers[0].username === 'Alice', 'Client 1 registered as active user');

    // Client 2 joins DESIGN_101 - Client 1 should receive user:joined
    const userJoinedPromise = new Promise((resolve) => {
      client1.once('user:joined', (user) => resolve(user));
    });

    client2.emit('board:join', {
      boardId: 'DESIGN_101',
      username: 'Bob',
      userColor: '#3b82f6'
    });

    const joinedUser = await userJoinedPromise;
    assert(joinedUser.username === 'Bob' && joinedUser.color === '#3b82f6', 'Client 1 received user:joined broadcast with Bob\'s details');

    // -------------------------------------------------------------
    // Test 2: Real-Time Stroke Streaming & Buffer Synchronization
    // -------------------------------------------------------------
    console.log('\n👉 [Test 2] Real-Time Stroke Streaming (draw:stroke -> draw:broadcast):');
    const strokeSample = {
      strokeId: 'strk_001',
      prevX: 100,
      prevY: 150,
      currX: 110,
      currY: 160,
      color: '#ff5722',
      size: 4,
      tool: 'brush'
    };

    const strokeBroadcastPromise = new Promise((resolve) => {
      client2.once('draw:broadcast', (payload) => resolve(payload));
    });

    client1.emit('draw:stroke', {
      boardId: 'DESIGN_101',
      stroke: strokeSample
    });

    const broadcastPayload = await strokeBroadcastPromise;
    assert(broadcastPayload.stroke && broadcastPayload.stroke.currX === 110, 'Client 2 received relayed stroke segment in real time');
    assert(boardRooms['DESIGN_101'].strokes.length === 1, 'Server successfully appended stroke to in-memory room buffer');

    // Test late joiner gets history
    console.log('\n👉 [Test 3] Late Joiner History Synchronization (board:init):');
    const client3 = await createClient('Dave', '#8b5cf6');
    const client3InitPromise = new Promise((resolve) => {
      client3.once('board:init', (data) => resolve(data));
    });

    client3.emit('board:join', {
      boardId: 'DESIGN_101',
      username: 'Dave',
      userColor: '#8b5cf6'
    });

    const initData3 = await client3InitPromise;
    assert(initData3.strokes.length === 1 && initData3.strokes[0].strokeId === 'strk_001', 'Late joiner Dave received prior drawing history on board:init');

    // -------------------------------------------------------------
    // Test 4: Live Multi-User Collaborator Cursor Tracking
    // -------------------------------------------------------------
    console.log('\n👉 [Test 4] Live Collaborator Cursor Tracking (cursor:move -> cursor:update):');
    const cursorPromise = new Promise((resolve) => {
      client2.once('cursor:update', (data) => resolve(data));
    });

    client1.emit('cursor:move', {
      boardId: 'DESIGN_101',
      x: 340,
      y: 220
    });

    const cursorData = await cursorPromise;
    assert(cursorData.x === 340 && cursorData.y === 220 && cursorData.username === 'Alice', 'Client 2 received live cursor coordinates for Alice');

    // -------------------------------------------------------------
    // Test 5: Coordinated Undo (draw:undo -> board:sync)
    // -------------------------------------------------------------
    console.log('\n👉 [Test 5] State Rollback Algorithm (draw:undo -> board:sync):');
    // Add a second continuous stroke
    const strokeSample2 = {
      strokeId: 'strk_002',
      prevX: 200,
      prevY: 200,
      currX: 215,
      currY: 215,
      color: '#3b82f6',
      size: 6,
      tool: 'brush'
    };

    client2.emit('draw:stroke', {
      boardId: 'DESIGN_101',
      stroke: strokeSample2
    });

    await new Promise((r) => setTimeout(r, 60));
    assert(boardRooms['DESIGN_101'].strokes.length === 2, 'Room buffer has 2 continuous strokes before undo');

    const syncPromise = new Promise((resolve) => {
      client1.once('board:sync', (data) => resolve(data));
    });

    client1.emit('draw:undo', { boardId: 'DESIGN_101' });
    const syncData = await syncPromise;
    assert(syncData.strokes.length === 1 && syncData.strokes[0].strokeId === 'strk_001', 'Undo successfully rolled back the latest stroke action across the room');

    // -------------------------------------------------------------
    // Test 6: Canvas Reset (board:clear -> board:cleared)
    // -------------------------------------------------------------
    console.log('\n👉 [Test 6] Canvas Reset (board:clear -> board:cleared):');
    const clearedPromise = new Promise((resolve) => {
      client2.once('board:cleared', (data) => resolve(data));
    });

    client1.emit('board:clear', { boardId: 'DESIGN_101' });
    const clearedData = await clearedPromise;
    assert(boardRooms['DESIGN_101'].strokes.length === 0, 'Server cleared all strokes in room memory');
    assert(clearedData.clearedBy === 'Alice', 'Client 2 notified that canvas was cleared by Alice');

    // -------------------------------------------------------------
    // Test 7: Multi-tenant Room Isolation
    // -------------------------------------------------------------
    console.log('\n👉 [Test 7] Room Isolation (DESIGN_101 vs ROOM_B):');
    let roomBleak = false;
    clientRoomB.on('draw:broadcast', () => { roomBleak = true; });

    clientRoomB.emit('board:join', {
      boardId: 'ROOM_B',
      username: 'Charlie',
      userColor: '#10b981'
    });
    await new Promise((r) => setTimeout(r, 50));

    client1.emit('draw:stroke', {
      boardId: 'DESIGN_101',
      stroke: { strokeId: 'strk_iso', prevX: 1, prevY: 1, currX: 2, currY: 2 }
    });
    await new Promise((r) => setTimeout(r, 100));

    assert(!roomBleak, 'Room B client isolated from drawing events emitted in DESIGN_101');

    // -------------------------------------------------------------
    // Test 8: Peer Disconnection (user:left)
    // -------------------------------------------------------------
    console.log('\n👉 [Test 8] Peer Disconnection Clean-up (user:left):');
    const userLeftPromise = new Promise((resolve) => {
      client1.once('user:left', (data) => resolve(data));
    });

    client2.disconnect();
    const leftData = await userLeftPromise;
    assert(leftData.username === 'Bob', 'Client 1 received user:left notification after Bob disconnected');

    // Disconnect remaining clients
    client1.disconnect();
    client3.disconnect();
    clientRoomB.disconnect();

    console.log('\n========================================================');
    console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log('========================================================\n');

    if (passedTests === totalTests) {
      console.log('🎉 ALL ASSIGNMENT 11 TESTS PASSED PERFECTLY!');
    }
  } catch (err) {
    console.error('Unexpected error in test suite:', err);
    process.exitCode = 1;
  } finally {
    await teardownTestServer();
  }
}

if (require.main === module) {
  runTestSuite();
}

module.exports = { runTestSuite };
