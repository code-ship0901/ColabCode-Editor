const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const Folder = require("./models/Folder");
const File = require("./models/File");

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect("mongodb+srv://vanshika9dhiman_db_user:E4tkOkBuVF2DZANp@first.tzaxesy.mongodb.net/?appName=First")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB Connection Error:", err));

const codesDir = path.join(__dirname, "codes");
if (!fs.existsSync(codesDir)) fs.mkdirSync(codesDir);

app.post('/run', (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).send({ output: "No code provided" });
    const filePath = path.join(codesDir, "temp.cpp");
    const outPath = path.join(codesDir, "temp.exe");
    fs.writeFileSync(filePath, code);
    const command = `g++ "${filePath}" -o "${outPath}" && "${outPath}"`;
    exec(command, (error, stdout, stderr) => {
        if (error) return res.send({ output: stderr || error.message });
        res.send({ output: stdout });
    });
});

// ── Socket.io Implementation ─────────────────────────── //
const fileCache = {};

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, userName, color }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;
    socket.color = color;
    socket.to(roomId).emit("user-joined", { socketId: socket.id, userName, color });

    // Send existing users to this new user
    const users = [];
    const clients = io.sockets.adapter.rooms.get(roomId);
    if (clients) {
      for (const clientId of clients) {
        if (clientId !== socket.id) {
          const clientSocket = io.sockets.sockets.get(clientId);
          if (clientSocket) {
            users.push({ socketId: clientSocket.id, userName: clientSocket.userName, color: clientSocket.color });
          }
        }
      }
    }
    socket.emit("room-users", users);
  });

  socket.on("open-file", ({ roomId, fileId }) => {
    // Leave previous file rooms
    Object.keys(socket.rooms).forEach(r => {
      if (r.startsWith("file-") && r !== `file-${fileId}`) socket.leave(r);
    });
    socket.join(`file-${fileId}`);

    if (fileCache[fileId]) {
      socket.emit("sync-code", { fileId, code: fileCache[fileId] });
    }
  });

  socket.on("code-change", ({ roomId, fileId, code }) => {
    fileCache[fileId] = code;
    socket.to(`file-${fileId}`).emit("code-update", { fileId, code });
  });

  socket.on("cursor-move", ({ roomId, fileId, position, selection, userName, color }) => {
    socket.to(`file-${fileId}`).emit("cursor-update", {
      socketId: socket.id, position, selection, userName, color, fileId
    });
  });

  socket.on("disconnect", () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("user-left", { socketId: socket.id });
    }
  });
});

const emitFileSystemChange = (roomId) => {
    io.to(roomId).emit("file-system-changed");
};

// File Explorer APIs //

// 1. Get Folder/File Tree
app.get('/api/tree', async (req, res) => {
    try {
        const { roomId } = req.query;
        const folders = await Folder.find({ roomId });
        const files = await File.find({ roomId });
        res.json({ folders, files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Create Folder
app.post('/api/folders', async (req, res) => {
    try {
        const { name, parentId, roomId } = req.body;
        const newFolder = new Folder({ name, parentId: parentId || null, roomId });
        await newFolder.save();
        emitFileSystemChange(roomId);
        res.json(newFolder);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Create File
app.post('/api/files', async (req, res) => {
    try {
        const { name, folderId, content, roomId } = req.body;
        const newFile = new File({ name, folderId: folderId || null, content: content || '', roomId });
        await newFile.save();
        emitFileSystemChange(roomId);
        res.json(newFile);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Rename File or Folder
app.put('/api/rename', async (req, res) => {
    try {
        const { id, type, newName } = req.body;
        if (type === 'folder') {
            const f = await Folder.findByIdAndUpdate(id, { name: newName }, { new: true });
            if (f) emitFileSystemChange(f.roomId);
            res.json(f);
        } else {
            const f = await File.findByIdAndUpdate(id, { name: newName }, { new: true });
            if (f) emitFileSystemChange(f.roomId);
            res.json(f);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Delete File or Folder
app.delete('/api/delete', async (req, res) => {
    try {
        const { id, type } = req.body;
        if (type === 'folder') {
            const f = await Folder.findByIdAndDelete(id);
            if(f) {
                await File.deleteMany({ folderId: id });
                await Folder.deleteMany({ parentId: id });
                emitFileSystemChange(f.roomId);
            }
            res.json({ success: true });
        } else {
            const f = await File.findByIdAndDelete(id);
            if(f) emitFileSystemChange(f.roomId);
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Get File Content
app.get('/api/files/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: "File not found" });
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Update File Content
app.put('/api/files/:id', async (req, res) => {
    try {
        const { content } = req.body;
        const file = await File.findByIdAndUpdate(req.params.id, { content }, { new: true });
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 5000;
server.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));
