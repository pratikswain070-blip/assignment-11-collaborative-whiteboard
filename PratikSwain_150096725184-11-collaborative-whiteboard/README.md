# Real-Time Collaborative Whiteboard & Canvas

> **Student Name:** Pratik Swain  
> **Roll No:** `150096725184`  
> **Live Render Deployment:** [https://assignment-11-collaborative-whiteboard-eg38.onrender.com](https://assignment-11-collaborative-whiteboard-eg38.onrender.com/)  
> **Repository:** [https://github.com/pratikswain070-blip/assignment-11-collaborative-whiteboard](https://github.com/pratikswain070-blip/assignment-11-collaborative-whiteboard)  
> **Tech Stack:** Node.js, Express.js, Socket.io, HTML5 Canvas API, CORS, dotenv  

---

## Overview

A high-performance real-time collaborative whiteboard built with Node.js, Express, and Socket.io. The application supports continuous vector stroke streaming, room-based partitioning, server-side in-memory history caching, live collaborator cursor tracking with peer badges, and coordinated state rollbacks (`draw:undo` and `board:clear`).

### Key Capabilities
- **Real-Time Stroke Streaming:** High-frequency bi-directional event streaming using Socket.io.
- **In-Memory History Buffer:** Room-based history buffer (`boardRooms`) ensuring newly joined users immediately receive existing drawings upon joining.
- **Live Cursor Tracking:** Broadcasts peer cursor positions in real time with custom name tags and colors.
- **State Rollback (Undo & Clear):** Supports atomic undo of continuous strokes via unique stroke identifiers and whole-canvas reset.
- **Room Partitioning:** Isolated canvas rooms allowing multiple groups to work simultaneously without cross-talk.
- **Client Features:** Freehand brush, eraser, line, rectangle, circle tools, customizable stroke width, color palette, custom color picker, active user list, and PNG export.

---

## Real-Time Canvas Event Protocol

### Room & Session Events

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `board:join` | Client -> Server | `{ "boardId": "DESIGN_101", "username": "Pratik", "userColor": "#ff5722" }` | Join a collaborative room |
| `board:init` | Server -> Client | `{ "strokes": [...], "activeUsers": [...] }` | Emits stroke history and active users to newly joined peer |
| `user:joined` | Server -> Room | `{ "userId": "socket_id", "username": "Pratik", "color": "#ff5722" }` | Notifies other room participants |
| `user:left` | Server -> Room | `{ "userId": "socket_id", "username": "Pratik" }` | Broadcasted when a peer disconnects |

### Drawing & Pointer Events

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `draw:stroke` | Client -> Server | `{ "boardId": "...", "stroke": { "strokeId": "...", "prevX": 120, "prevY": 80, "currX": 125, "currY": 85, "color": "#000", "size": 3, "tool": "brush" } }` | Appends line segment to room history |
| `draw:broadcast` | Server -> Room | `{ "stroke": { ... } }` | Relays drawing stroke to peers in the room |
| `cursor:move` | Client -> Server | `{ "boardId": "...", "x": 140, "y": 95 }` | Pointer position synchronization |
| `cursor:update` | Server -> Room | `{ "userId": "socket_id", "username": "Pratik", "color": "#ff5722", "x": 140, "y": 95 }` | Relays peer cursor positions on screen |
| `board:clear` | Client -> Server | `{ "boardId": "DESIGN_101" }` | Clears all strokes for this room |
| `board:cleared` | Server -> Room | `{ "clearedBy": "Pratik" }` | Notifies room peers to clear canvas |
| `draw:undo` | Client -> Server | `{ "boardId": "DESIGN_101" }` | Removes the last continuous stroke action |
| `board:sync` | Server -> Room | `{ "strokes": [...] }` | Broadcasts state snapshot after undo |

---

## Server Architecture

```javascript
const boardRooms = {
  "DESIGN_101": {
    boardId: "DESIGN_101",
    strokes: [
      {
        strokeId: "stroke_1726200000000_abc123",
        prevX: 120,
        prevY: 80,
        currX: 125,
        currY: 85,
        color: "#1e293b",
        size: 4,
        tool: "brush",
        authorId: "socket_id",
        timestamp: 1726200000000
      }
    ],
    users: {
      "socket_id": {
        username: "Pratik",
        color: "#ff5722",
        cursor: { x: 140, y: 95 }
      }
    }
  }
};
```

---

## Project Structure

```text
pratik swain 150096725184/
├── public/
│   ├── canvas.js
│   ├── index.html
│   └── styles.css
├── sockets/
│   ├── boardHandler.js
│   └── cursorHandler.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
├── test-socket.js
└── README.md
```

---

## Environment Variables

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Application server port | `5000` (Render) / `5001` (Local) |
| `NODE_ENV` | Application environment mode | `production` / `development` |
| `CORS_ORIGIN` | Allowed CORS origins for Socket.io | `*` |

---

## Setup & Execution

### 1. Install Dependencies
```bash
cd "pratik swain 150096725184"
npm install
```

### 2. Run the Application
```bash
# Production mode
npm start

# Development mode (with nodemon)
npm run dev
```

### 3. Run Automated Tests
```bash
npm test
```

All 13 automated test suites verify multi-client room joining, stroke synchronization, live cursor coordinates, undo state rollbacks, and canvas clearing.
