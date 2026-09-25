/**
 * Collaborative Canvas Client Logic & Socket.io Event Streamer
 * Assignment 11: Real-Time Collaborative Whiteboard & Canvas
 * Student: Pratik Swain (150096725184)
 */

(() => {
  // DOM Elements
  const canvas = document.getElementById('whiteboard');
  const ctx = canvas.getContext('2d');
  const cursorOverlay = document.getElementById('cursor-overlay');

  // Nav & Room Controls
  const inputRoomId = document.getElementById('input-room-id');
  const btnChangeRoom = document.getElementById('btn-change-room');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const chipRooms = document.querySelectorAll('.chip-room');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const pingBadge = document.getElementById('ping-badge');
  const avatarStack = document.getElementById('avatar-stack');
  const userCountBadge = document.getElementById('user-count-badge');
  const userProfilePill = document.getElementById('user-profile-pill');
  const userAvatarPreview = document.getElementById('user-avatar-preview');
  const userNameDisplay = document.getElementById('user-name-display');

  // Toolbar Controls
  const toolButtons = document.querySelectorAll('.tool-btn');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const inputColorPicker = document.getElementById('input-color-picker');
  const pickerLabel = document.getElementById('picker-label');
  const inputStrokeSize = document.getElementById('input-stroke-size');
  const strokeSizeText = document.getElementById('stroke-size-text');
  const strokePreviewCircle = document.getElementById('stroke-preview-circle');
  const btnUndo = document.getElementById('btn-undo');
  const btnClear = document.getElementById('btn-clear');
  const btnExport = document.getElementById('btn-export');
  const statStrokeCount = document.getElementById('stat-stroke-count');
  const statCoords = document.getElementById('stat-coords');
  const toastContainer = document.getElementById('toast-container');

  // Modal Controls
  const modalProfile = document.getElementById('modal-profile');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const inputUsername = document.getElementById('input-username');
  const userColorBtns = document.querySelectorAll('.user-color-btn');
  const btnSaveProfile = document.getElementById('btn-save-profile');

  // Application State
  const urlParams = new URLSearchParams(window.location.search);
  let currentBoardId = (urlParams.get('board') || 'DESIGN_101').trim();
  inputRoomId.value = currentBoardId;

  // Collaborator Profile State
  const defaultUserNames = ['Alice', 'Bob', 'Charlie', 'Pratik', 'Dev', 'Alex', 'Sam'];
  const defaultColors = ['#ff5722', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#f59e0b'];

  let currentUser = {
    username: localStorage.getItem('collab_username') || ('Pratik_' + Math.floor(Math.random() * 900 + 100)),
    color: localStorage.getItem('collab_usercolor') || defaultColors[Math.floor(Math.random() * defaultColors.length)]
  };

  // Drawing State
  let activeTool = 'brush'; // 'brush', 'eraser', 'line', 'rect', 'circle'
  let activeColor = '#1e293b';
  let strokeSize = 4;
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let currentStrokeId = null;
  let allStrokes = [];
  let activeUsers = [];
  let peerCursors = {}; // Map of userId -> DOM element
  let snapshotBeforeShape = null;

  // Throttling for cursor tracking
  let lastCursorEmission = 0;
  const CURSOR_EMIT_INTERVAL = 35; // ~30 fps mouse tracking

  // Setup User Profile Display
  function updateUserUI() {
    userNameDisplay.textContent = currentUser.username;
    userAvatarPreview.textContent = currentUser.username.charAt(0).toUpperCase();
    userAvatarPreview.style.backgroundColor = currentUser.color;
  }
  updateUserUI();

  // Socket Connection
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionAttempts: 20
  });

  // Latency ping loop
  setInterval(() => {
    if (socket.connected) {
      const start = Date.now();
      socket.volatile.emit('ping_check', () => {
        const latency = Date.now() - start;
        pingBadge.textContent = `${latency}ms`;
      });
    }
  }, 4000);

  // Connection Handlers
  socket.on('connect', () => {
    statusDot.className = 'status-dot online';
    statusText.textContent = 'Connected';
    joinRoom(currentBoardId);
  });

  socket.on('disconnect', () => {
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Disconnected';
  });

  socket.on('connect_error', () => {
    statusDot.className = 'status-dot connecting';
    statusText.textContent = 'Reconnecting';
  });

  // Protocol: Join Room
  function joinRoom(boardId) {
    currentBoardId = boardId;
    inputRoomId.value = boardId;
    
    // Update URL query string without reloading
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?board=${encodeURIComponent(boardId)}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);

    socket.emit('board:join', {
      boardId: currentBoardId,
      username: currentUser.username,
      userColor: currentUser.color
    });
  }

  // Protocol: board:init
  socket.on('board:init', (data) => {
    allStrokes = data.strokes || [];
    renderAllStrokes();
    updateActiveUsers(data.activeUsers || []);
    showToast(`Joined board #${currentBoardId}`);
  });

  // Protocol: user:joined
  socket.on('user:joined', (user) => {
    // Add user if not already in list
    const exists = activeUsers.some(u => u.userId === user.userId);
    if (!exists) {
      activeUsers.push(user);
      renderAvatarStack();
    }
    showToast(`${user.username} joined the board`);
  });

  // Protocol: user:left
  socket.on('user:left', ({ userId, username }) => {
    activeUsers = activeUsers.filter(u => u.userId !== userId);
    renderAvatarStack();
    removePeerCursor(userId);
    showToast(`${username || 'Collaborator'} left`);
  });

  // Protocol: draw:broadcast
  socket.on('draw:broadcast', ({ stroke }) => {
    if (!stroke) return;
    allStrokes.push(stroke);
    drawStrokeSegment(stroke);
    updateStats();
  });

  // Protocol: cursor:update
  socket.on('cursor:update', ({ userId, x, y, username, color }) => {
    renderPeerCursor(userId, x, y, username, color);
  });

  // Protocol: board:cleared
  socket.on('board:cleared', ({ clearedBy }) => {
    allStrokes = [];
    clearCanvasDisplay();
    updateStats();
    showToast(`Canvas cleared by ${clearedBy}`);
  });

  // Protocol: board:sync (After Undo)
  socket.on('board:sync', ({ strokes }) => {
    allStrokes = strokes || [];
    renderAllStrokes();
    updateStats();
    showToast('Undo performed');
  });

  // ========================================================
  // Canvas Sizing & High-DPI Scaling
  // ========================================================
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    renderAllStrokes();
  }

  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 50);

  function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  // ========================================================
  // Drawing Engine
  // ========================================================
  function startDrawing(e) {
    isDrawing = true;
    const coords = getCanvasCoordinates(e);
    startX = coords.x;
    startY = coords.y;
    lastX = coords.x;
    lastY = coords.y;

    currentStrokeId = `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;

    if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'circle') {
      // Save canvas state before drawing shape preview
      snapshotBeforeShape = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      // For single clicks (dots)
      const stroke = {
        strokeId: currentStrokeId,
        prevX: startX,
        prevY: startY,
        currX: startX + 0.1,
        currY: startY + 0.1,
        color: activeTool === 'eraser' ? '#f8fafc' : activeColor,
        size: activeTool === 'eraser' ? strokeSize * 3 : strokeSize,
        tool: activeTool
      };
      drawStrokeSegment(stroke);
      allStrokes.push(stroke);
      socket.emit('draw:stroke', { boardId: currentBoardId, stroke });
      updateStats();
    }
  }

  function drawMove(e) {
    const coords = getCanvasCoordinates(e);
    const currX = coords.x;
    const currY = coords.y;

    statCoords.textContent = `X: ${Math.round(currX)}, Y: ${Math.round(currY)}`;

    // High frequency cursor sync
    const now = Date.now();
    if (now - lastCursorEmission > CURSOR_EMIT_INTERVAL) {
      socket.emit('cursor:move', {
        boardId: currentBoardId,
        x: currX,
        y: currY
      });
      lastCursorEmission = now;
    }

    if (!isDrawing) return;

    if (activeTool === 'brush' || activeTool === 'eraser') {
      const stroke = {
        strokeId: currentStrokeId,
        prevX: lastX,
        prevY: lastY,
        currX: currX,
        currY: currY,
        color: activeTool === 'eraser' ? '#f8fafc' : activeColor,
        size: activeTool === 'eraser' ? strokeSize * 3 : strokeSize,
        tool: activeTool
      };

      drawStrokeSegment(stroke);
      allStrokes.push(stroke);
      socket.emit('draw:stroke', { boardId: currentBoardId, stroke });
      updateStats();

      lastX = currX;
      lastY = currY;
    } else if (snapshotBeforeShape) {
      // Live shape preview
      ctx.putImageData(snapshotBeforeShape, 0, 0);
      drawGeometricShapePreview(startX, startY, currX, currY, activeTool, activeColor, strokeSize);
    }
  }

  function stopDrawing(e) {
    if (!isDrawing) return;
    isDrawing = false;

    if ((activeTool === 'line' || activeTool === 'rect' || activeTool === 'circle') && snapshotBeforeShape) {
      const coords = getCanvasCoordinates(e);
      ctx.putImageData(snapshotBeforeShape, 0, 0);

      const stroke = {
        strokeId: currentStrokeId,
        prevX: startX,
        prevY: startY,
        currX: coords.x,
        currY: coords.y,
        color: activeColor,
        size: strokeSize,
        tool: activeTool
      };

      drawStrokeSegment(stroke);
      allStrokes.push(stroke);
      socket.emit('draw:stroke', { boardId: currentBoardId, stroke });
      updateStats();
      snapshotBeforeShape = null;
    }
  }

  function drawStrokeSegment(s) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = s.color || '#000';
    ctx.lineWidth = s.size || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.tool === 'eraser') {
      ctx.strokeStyle = '#f8fafc';
    }

    if (s.tool === 'line') {
      ctx.moveTo(s.prevX, s.prevY);
      ctx.lineTo(s.currX, s.currY);
      ctx.stroke();
    } else if (s.tool === 'rect') {
      const w = s.currX - s.prevX;
      const h = s.currY - s.prevY;
      ctx.strokeRect(s.prevX, s.prevY, w, h);
    } else if (s.tool === 'circle') {
      const radius = Math.hypot(s.currX - s.prevX, s.currY - s.prevY);
      ctx.arc(s.prevX, s.prevY, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      // Freehand segment
      ctx.moveTo(s.prevX, s.prevY);
      ctx.lineTo(s.currX, s.currY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGeometricShapePreview(x1, y1, x2, y2, tool, color, size) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'line') {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    } else if (tool === 'circle') {
      const radius = Math.hypot(x2 - x1, y2 - y1);
      ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderAllStrokes() {
    clearCanvasDisplay();
    allStrokes.forEach(s => drawStrokeSegment(s));
    updateStats();
  }

  function clearCanvasDisplay() {
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  function updateStats() {
    statStrokeCount.textContent = allStrokes.length;
  }

  // Mouse & Touch Event Listeners
  canvas.addEventListener('mousedown', startDrawing);
  window.addEventListener('mousemove', drawMove);
  window.addEventListener('mouseup', stopDrawing);

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrawing(e);
  }, { passive: false });

  window.addEventListener('touchmove', (e) => {
    drawMove(e);
  }, { passive: false });

  window.addEventListener('touchend', (e) => {
    stopDrawing(e);
  });

  // ========================================================
  // Collaborator Cursors Overlay
  // ========================================================
  function renderPeerCursor(userId, x, y, username, color) {
    let el = peerCursors[userId];
    if (!el) {
      el = document.createElement('div');
      el.className = 'peer-cursor';
      el.innerHTML = `
        <svg class="peer-cursor-pointer" viewBox="0 0 24 24" fill="${color}" stroke="#ffffff" stroke-width="1.5">
          <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 0 0-.85.36z"/>
        </svg>
        <span class="peer-cursor-tag" style="background:${color}">${username}</span>
      `;
      cursorOverlay.appendChild(el);
      peerCursors[userId] = el;
    }

    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    // Auto cleanup if inactive
    clearTimeout(el.idleTimer);
    el.idleTimer = setTimeout(() => {
      removePeerCursor(userId);
    }, 15000);
  }

  function removePeerCursor(userId) {
    if (peerCursors[userId]) {
      peerCursors[userId].remove();
      delete peerCursors[userId];
    }
  }

  // ========================================================
  // Active Collaborators Avatar Stack
  // ========================================================
  function updateActiveUsers(users) {
    activeUsers = users;
    renderAvatarStack();
  }

  function renderAvatarStack() {
    avatarStack.innerHTML = '';
    activeUsers.forEach(u => {
      const chip = document.createElement('div');
      chip.className = 'user-avatar-chip';
      chip.style.backgroundColor = u.color || '#3b82f6';
      chip.textContent = (u.username || 'U').charAt(0).toUpperCase();
      chip.title = u.username;
      avatarStack.appendChild(chip);
    });
    userCountBadge.textContent = `${activeUsers.length} online`;
  }

  // ========================================================
  // Toolbar Interactions & Controls
  // ========================================================
  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTool = btn.dataset.tool;
      showToast(`Tool: ${activeTool.toUpperCase()}`);
    });
  });

  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      activeColor = swatch.dataset.color;
      inputColorPicker.value = activeColor;
      strokePreviewCircle.style.backgroundColor = activeColor;
    });
  });

  inputColorPicker.addEventListener('input', (e) => {
    activeColor = e.target.value;
    colorSwatches.forEach(s => s.classList.remove('active'));
    strokePreviewCircle.style.backgroundColor = activeColor;
  });

  inputStrokeSize.addEventListener('input', (e) => {
    strokeSize = parseInt(e.target.value, 10);
    strokeSizeText.textContent = `${strokeSize}px`;
    strokePreviewCircle.style.width = `${Math.min(strokeSize, 26)}px`;
    strokePreviewCircle.style.height = `${Math.min(strokeSize, 26)}px`;
  });

  // Undo Button
  btnUndo.addEventListener('click', () => {
    socket.emit('draw:undo', { boardId: currentBoardId });
  });

  // Clear Button
  btnClear.addEventListener('click', () => {
    if (confirm('Clear entire canvas for all collaborators?')) {
      socket.emit('board:clear', { boardId: currentBoardId });
    }
  });

  // Export PNG
  btnExport.addEventListener('click', () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill white background
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `collabboard_${currentBoardId}_${Date.now()}.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
    showToast('Canvas exported as PNG');
  });

  // Room Controls
  btnChangeRoom.addEventListener('click', () => {
    const newRoom = inputRoomId.value.trim();
    if (newRoom && newRoom !== currentBoardId) {
      joinRoom(newRoom);
    }
  });

  inputRoomId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const newRoom = inputRoomId.value.trim();
      if (newRoom && newRoom !== currentBoardId) {
        joinRoom(newRoom);
      }
    }
  });

  chipRooms.forEach(chip => {
    chip.addEventListener('click', () => {
      const room = chip.dataset.room;
      if (room && room !== currentBoardId) {
        joinRoom(room);
      }
    });
  });

  btnCopyLink.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showToast('Invite link copied to clipboard!');
    }).catch(() => {
      showToast('Board URL ready to share');
    });
  });

  // User Profile Modal
  userProfilePill.addEventListener('click', () => {
    inputUsername.value = currentUser.username;
    modalProfile.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    modalProfile.classList.add('hidden');
  });

  userColorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      userColorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  btnSaveProfile.addEventListener('click', () => {
    const name = inputUsername.value.trim() || currentUser.username;
    const activeColorBtn = document.querySelector('.user-color-btn.active');
    const color = activeColorBtn ? activeColorBtn.dataset.color : currentUser.color;

    currentUser = { username: name, color };
    localStorage.setItem('collab_username', name);
    localStorage.setItem('collab_usercolor', color);

    updateUserUI();
    modalProfile.classList.add('hidden');

    // Reconnect / re-join with new identity
    joinRoom(currentBoardId);
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      socket.emit('draw:undo', { boardId: currentBoardId });
    } else if (e.key.toLowerCase() === 'p') {
      document.getElementById('tool-brush').click();
    } else if (e.key.toLowerCase() === 'e') {
      document.getElementById('tool-eraser').click();
    } else if (e.key.toLowerCase() === 'l') {
      document.getElementById('tool-line').click();
    } else if (e.key.toLowerCase() === 'r') {
      document.getElementById('tool-rect').click();
    } else if (e.key.toLowerCase() === 'c') {
      document.getElementById('tool-circle').click();
    }
  });

  // Toast Notification Helper
  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
})();
