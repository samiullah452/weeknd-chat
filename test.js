// Install socket.io-client before running: npm install socket.io-client

const { io } = require("socket.io-client");

// Replace this with your actual token
const token = "YOUR_AUTH_TOKEN_HERE";

// Connect to Socket.IO server with authentication
const socket = io("http://localhost:3000", {
  transports: ["websocket"], // ensures it uses WebSocket
  auth: {
    token: token, // sent during connection handshake
  },
});

// When connected
socket.on("connect", () => {
  console.log("Connected to Socket.IO server");

  // Emit the 'listRooms' event
  socket.emit("listRooms", { searchQuery: "Mis" });

  console.log("listRooms event emitted");
});

// Listen for response (if your server sends one)
socket.on("roomsListed", (data) => {
  console.log("Received listRooms response:", data);
});

// Handle errors
socket.on("connect_error", (err) => {
  console.error("Connection Error:", err.message);
});
