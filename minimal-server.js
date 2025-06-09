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
    origin: "https://flux-frontend-weld.vercel.app", // Allow specific origin
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  }
});

// Socket.IO event handling
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
  
  // Add your socket event handlers here
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Socket.IO is available`);
});

export default server; 