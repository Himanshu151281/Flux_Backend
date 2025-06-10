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
  }
});

// Store active sharing sessions
const activeSessions = new Map();
// Map of socket IDs to session IDs
const socketToSession = new Map();

// Socket.IO event handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // When a user creates a new sharing session
  socket.on('create-session', ({ sessionId, fileInfo }) => {
    console.log(`New session created: ${sessionId}`);
    activeSessions.set(sessionId, {
      senderId: socket.id,
      fileInfo,
      status: 'waiting',
      receiverId: null
    });
    socketToSession.set(socket.id, sessionId);
    
    // Confirm session creation to sender
    socket.emit('session-created', { sessionId, success: true });
  });
  
  // When a recipient accesses a shared link
  socket.on('join-session', ({ sessionId }) => {
    console.log(`User ${socket.id} attempting to join session ${sessionId}`);
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      socket.emit('session-join-error', { 
        error: 'Session not found or has expired' 
      });
      return;
    }
    
    if (session.status !== 'waiting') {
      socket.emit('session-join-error', { 
        error: 'This session is already in progress with another user' 
      });
      return;
    }
    
    // Update the session with recipient info
    session.receiverId = socket.id;
    session.status = 'pending-approval';
    activeSessions.set(sessionId, session);
    socketToSession.set(socket.id, sessionId);
    
    // Send notification to the sender that someone wants to join
    io.to(session.senderId).emit('share-request', {
      sessionId,
      receiverId: socket.id
    });
    
    // Notify recipient that the request has been sent
    socket.emit('waiting-for-approval', {
      sessionId,
      fileInfo: session.fileInfo
    });
  });
  
  // When sender accepts or declines the share request
  socket.on('share-response', ({ sessionId, accepted }) => {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      socket.emit('error', { error: 'Session not found' });
      return;
    }
    
    if (socket.id !== session.senderId) {
      socket.emit('error', { error: 'Unauthorized action' });
      return;
    }
    
    if (accepted) {
      // Update session status
      session.status = 'connected';
      activeSessions.set(sessionId, session);
      
      // Notify both parties that they're connected
      io.to(session.senderId).emit('connection-established', {
        sessionId,
        role: 'sender',
        peerSocketId: session.receiverId
      });
      
      io.to(session.receiverId).emit('connection-established', {
        sessionId,
        role: 'receiver',
        peerSocketId: session.senderId,
        fileInfo: session.fileInfo
      });
    } else {
      // Notify recipient that request was declined
      io.to(session.receiverId).emit('share-declined', { sessionId });
      
      // Reset session to waiting state
      session.status = 'waiting';
      session.receiverId = null;
      activeSessions.set(sessionId, session);
    }
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