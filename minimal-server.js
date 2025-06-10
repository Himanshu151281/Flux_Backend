import http from 'http';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

// Load environment variables
dotenv.config();

// Configure port
const PORT = process.env.PORT || 10000;

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
  res.setHeader('Access-Control-Allow-Credentials', true);
  
  // Handle OPTIONS method for preflight requests
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  
  // Very simple routing based on exact path match
  if (req.url === '/api/status') {
    res.statusCode = 200;
    res.end(JSON.stringify({ status: 'ok', message: 'Server is running' }));
    return;
  }
  
  if (req.url === '/') {
    res.statusCode = 200;
    res.end(JSON.stringify({ message: 'Dark Pizza Forge API is running' }));
    return;
  }
  
  // 404 for everything else
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Initialize Socket.IO with CORS configuration
const io = new Server(server, {
  cors: {
    origin: "*", // Allow any origin for now
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  // Increase ping timeout to prevent premature disconnections
  pingTimeout: 60000,
  // Increase ping interval for better connection stability
  pingInterval: 25000
});

// Store active sharing sessions
const activeSessions = new Map();
// Map of socket IDs to session IDs
const socketToSession = new Map();

// Session cleanup interval (1 hour)
const SESSION_LIFETIME = 60 * 60 * 1000;

// Periodically clean up expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.createdAt > SESSION_LIFETIME) {
      console.log(`Session ${sessionId} expired and removed`);
      
      // Notify participants if they're still connected
      if (session.senderId) {
        io.to(session.senderId).emit('session-expired', { sessionId });
      }
      if (session.receiverId) {
        io.to(session.receiverId).emit('session-expired', { sessionId });
      }
      
      // Clean up the session
      activeSessions.delete(sessionId);
      if (session.senderId) socketToSession.delete(session.senderId);
      if (session.receiverId) socketToSession.delete(session.receiverId);
    }
  }
}, 30000); // Check every 30 seconds

// Socket.IO event handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // When a user creates a new sharing session
  socket.on('create-session', ({ sessionId, fileInfo }) => {
    console.log(`New session created: ${sessionId} by user ${socket.id}`);
    console.log(`File info:`, fileInfo);
    activeSessions.set(sessionId, {
      senderId: socket.id,
      fileInfo,
      status: 'waiting',
      receiverId: null,
      createdAt: Date.now()
    });
    socketToSession.set(socket.id, sessionId);
    
    // Confirm session creation to sender
    socket.emit('session-created', { sessionId, success: true });
    console.log(`Session creation confirmed to sender ${socket.id}`);
  });
  
  // When a recipient accesses a shared link
  socket.on('join-session', ({ sessionId }) => {
    console.log(`User ${socket.id} attempting to join session ${sessionId}`);
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      console.log(`Error: Session ${sessionId} not found or expired`);
      socket.emit('session-join-error', { 
        error: 'Session not found or has expired' 
      });
      return;
    }
    
    if (session.status !== 'waiting') {
      console.log(`Error: Session ${sessionId} already in progress with another user`);
      socket.emit('session-join-error', { 
        error: 'This session is already in progress with another user' 
      });
      return;
    }
    
    console.log(`Updating session ${sessionId} with receiver ${socket.id}`);
    // Update the session with recipient info
    session.receiverId = socket.id;
    session.status = 'pending-approval';
    activeSessions.set(sessionId, session);
    socketToSession.set(socket.id, sessionId);
    
    // Send notification to the sender that someone wants to join
    console.log(`Sending share-request to sender ${session.senderId} from ${socket.id}`);
    io.to(session.senderId).emit('share-request', {
      sessionId,
      receiverId: socket.id
    });
    
    // Notify recipient that the request has been sent
    console.log(`Sending waiting-for-approval to receiver ${socket.id}`);
    socket.emit('waiting-for-approval', {
      sessionId,
      fileInfo: session.fileInfo
    });
  });
  
  // When sender accepts or declines the share request
  socket.on('share-response', ({ sessionId, accepted }) => {
    console.log(`Share response received for session ${sessionId}, accepted: ${accepted}`);
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      console.log(`Error: Session ${sessionId} not found`);
      socket.emit('error', { error: 'Session not found' });
      return;
    }
    
    if (socket.id !== session.senderId) {
      console.log(`Error: Unauthorized action by ${socket.id}, expected ${session.senderId}`);
      socket.emit('error', { error: 'Unauthorized action' });
      return;
    }
    
    if (accepted) {
      console.log(`Session ${sessionId} accepted, connecting ${session.senderId} and ${session.receiverId}`);
      // Update session status
      session.status = 'connected';
      activeSessions.set(sessionId, session);
      
      // Have the users join a room for easier communication
      const room = `session_${sessionId}`;
      socket.join(room);
      io.sockets.sockets.get(session.receiverId)?.join(room);
      
      // Notify both parties that they're connected
      console.log(`Sending connection-established to sender ${session.senderId}`);
      io.to(session.senderId).emit('connection-established', {
        sessionId,
        role: 'sender',
        peerSocketId: session.receiverId
      });
      
      console.log(`Sending connection-established to receiver ${session.receiverId}`);
      io.to(session.receiverId).emit('connection-established', {
        sessionId,
        role: 'receiver',
        peerSocketId: session.senderId,
        fileInfo: session.fileInfo
      });
    } else {
      console.log(`Session ${sessionId} declined, notifying receiver ${session.receiverId}`);
      // Notify recipient that request was declined
      io.to(session.receiverId).emit('share-declined', { sessionId });
      
      // Reset session to waiting state
      session.status = 'waiting';
      session.receiverId = null;
      activeSessions.set(sessionId, session);
    }
  });
  
  // Handle WebRTC signaling more directly
  socket.on('direct-signal', (data) => {
    console.log(`Direct signaling from ${socket.id} to ${data.targetId}`, data.type);
    
    // Forward the signal directly to the target
    socket.to(data.targetId).emit('direct-signal', {
      ...data,
      senderId: socket.id
    });
  });
  
  // Handle WebRTC offer more reliably
  socket.on('offer', (data) => {
    console.log(`Relaying WebRTC offer from ${socket.id} to ${data.targetId}`);
    
    // Forward the offer to the target
    socket.to(data.targetId).emit('offer', {
      ...data,
      senderId: socket.id
    });
  });
  
  // Handle WebRTC answer more reliably
  socket.on('answer', (data) => {
    console.log(`Relaying WebRTC answer from ${socket.id} to ${data.targetId}`);
    
    // Forward the answer to the target
    socket.to(data.targetId).emit('answer', {
      ...data,
      senderId: socket.id
    });
  });
  
  // Handle ICE candidates more reliably
  socket.on('ice-candidate', (data) => {
    console.log(`Relaying ICE candidate from ${socket.id} to ${data.targetId}`);
    
    // Forward the ICE candidate to the target
    socket.to(data.targetId).emit('ice-candidate', {
      ...data,
      senderId: socket.id
    });
  });
  
  // File transfer progress updates
  socket.on('transfer-progress', ({ sessionId, progress }) => {
    const session = activeSessions.get(sessionId);
    if (session) {
      const recipientId = socket.id === session.senderId ? session.receiverId : session.senderId;
      io.to(recipientId).emit('transfer-progress-update', { progress });
    }
  });
  
  // File transfer complete
  socket.on('transfer-complete', ({ sessionId }) => {
    const session = activeSessions.get(sessionId);
    if (session) {
      // Notify both parties
      io.to(session.senderId).emit('transfer-finished', { sessionId });
      io.to(session.receiverId).emit('transfer-finished', { sessionId });
      
      // Cleanup the session
      activeSessions.delete(sessionId);
      socketToSession.delete(session.senderId);
      socketToSession.delete(session.receiverId);
    }
  });
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Check if this socket was part of a session
    const sessionId = socketToSession.get(socket.id);
    if (sessionId) {
      const session = activeSessions.get(sessionId);
      
      if (session) {
        // Notify the other party if they exist
        if (session.senderId === socket.id && session.receiverId) {
          io.to(session.receiverId).emit('peer-disconnected', { sessionId });
          socketToSession.delete(session.receiverId);
        } else if (session.receiverId === socket.id && session.senderId) {
          io.to(session.senderId).emit('peer-disconnected', { sessionId });
        }
        
        // Clean up the session
        activeSessions.delete(sessionId);
      }
      
      socketToSession.delete(socket.id);
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Socket.IO is available`);
});

export default server; 