import http from 'http';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configure port
const PORT = process.env.PORT || 10000;

// Create a simple HTTP server
const server = http.createServer((req, res) => {
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

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default server; 