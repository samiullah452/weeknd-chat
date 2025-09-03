require('dotenv').config();
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const http = require('http');

const redisClient = require('./config/redis');
const socketService = require('./services/socketService');
const AuthMiddleware = require('./middleware/auth');

const PORT = process.env.PORT || 3000;

// Create a simple HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

// Create Socket.IO server using the same HTTP server
const io = new Server(httpServer, {
  adapter: createAdapter(redisClient.getPubClient(), redisClient.getSubClient()),
});

io.use(AuthMiddleware.authenticateSocket);

io.on('connection', (socket) => {
  socketService.handleConnection(socket, io);
});

const startServer = async () => {
  try {
    httpServer.listen(PORT, () => {
      console.log(`🚀 WebSocket + Health check server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redisClient.close();
  io.close(() => {
    httpServer.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  });
});

module.exports = { io };
