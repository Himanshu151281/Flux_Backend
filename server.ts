import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueFileName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueFileName);
  }
});

const upload = multer({ storage });

// Get allowed origins from environment or use defaults
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:8080', 'https://dark-pizza-forge.vercel.app'];

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
}

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const fileData = {
      id: path.parse(req.file.filename).name.split('-')[0],
      fileName: req.file.originalname,
      filePath: req.file.path,
      fileSize: req.file.size,
      fileType: req.file.mimetype
    };

    // Notify all connected clients about the new file
    io.emit('fileUploaded', fileData);

    res.status(200).json({
      message: 'File uploaded successfully',
      fileId: fileData.id,
      fileName: fileData.fileName
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// File download endpoint
app.get('/api/download/:fileId', (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    // Find the file with the matching ID prefix
    const files = fs.readdirSync(UPLOAD_DIR);
    const targetFile = files.find(file => file.startsWith(fileId));
    
    if (!targetFile) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    
    const filePath = path.join(UPLOAD_DIR, targetFile);
    const originalName = targetFile.substring(targetFile.indexOf('-') + 1);
    
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// List all available files
app.get('/api/files', (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(UPLOAD_DIR);
    const fileList = files.map(file => {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      const fileId = file.split('-')[0];
      const fileName = file.substring(file.indexOf('-') + 1);
      
      return {
        id: fileId,
        name: fileName,
        size: stats.size,
        createdAt: stats.birthtime
      };
    });
    
    res.status(200).json({ files: fileList });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// API endpoint to check server status
app.get('/api/status', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Handle WebRTC signaling: offer
  socket.on('offer', (data) => {
    console.log(`Relaying offer from ${data.senderId} to ${data.targetId}`);
    socket.to(data.targetId).emit('offer', data);
  });
  
  // Handle WebRTC signaling: answer
  socket.on('answer', (data) => {
    console.log(`Relaying answer from ${data.senderId} to ${data.targetId}`);
    socket.to(data.targetId).emit('answer', data);
  });
  
  // Handle WebRTC signaling: ICE candidate
  socket.on('ice-candidate', (data) => {
    console.log(`Relaying ICE candidate from ${data.senderId} to ${data.targetId}`);
    socket.to(data.targetId).emit('ice-candidate', data);
  });
  
  // Handle room joining for direct messaging
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Catch-all handler to serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default server; 