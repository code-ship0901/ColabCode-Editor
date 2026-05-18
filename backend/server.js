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

// Request logger
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose.connect("mongodb://127.0.0.1:27017/colabcode")
    .then(() => console.log("✅ MongoDB Connected Successfully (Local)"))
    .catch(err => {
        console.error("❌ MongoDB Connection Error!");
        console.error("Technical Message:", err.message);
    });

const codesDir = path.join(__dirname, "codes");
if (!fs.existsSync(codesDir)) fs.mkdirSync(codesDir);

// ── Run C++ Code ──────────────────────────────────────────────
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

// ── In-memory caches (cleared on restart) ────────────────────
const fileCache = {};       // fileId -> latest code string
const wbCache = {};         // fileId -> strokes JSON string

// ── Socket.io ────────────────────────────────────────────────
io.on("connection", (socket) => {

    // ── Join Room ────────────────────────────────────────────
    socket.on("join-room", ({ roomId, userName, color }) => {
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userName = userName;
        socket.color = color;

        // Tell others someone joined
        socket.to(roomId).emit("user-joined", { socketId: socket.id, userName, color });

        // Send list of existing users to the new joiner
        const users = [];
        const clients = io.sockets.adapter.rooms.get(roomId);
        if (clients) {
            for (const clientId of clients) {
                if (clientId !== socket.id) {
                    const s = io.sockets.sockets.get(clientId);
                    if (s) users.push({ socketId: s.id, userName: s.userName, color: s.color });
                }
            }
        }
        socket.emit("room-users", users);
    });

    // ── Open File (join per-file room for code + cursor sync) ─
    socket.on("open-file", ({ roomId, fileId }) => {
        // Leave all previous file rooms
        for (const r of socket.rooms) {
            if (r.startsWith("file-") && r !== `file-${fileId}`) socket.leave(r);
        }
        socket.join(`file-${fileId}`);

        // Send cached code if available
        if (fileCache[fileId] !== undefined) {
            socket.emit("sync-code", { fileId, code: fileCache[fileId] });
        }
        // Send cached whiteboard if available
        if (wbCache[fileId] !== undefined) {
            socket.emit("sync-whiteboard", { fileId, data: wbCache[fileId] });
        }
    });

    // ── Code Changes ──────────────────────────────────────────
    socket.on("code-change", ({ roomId, fileId, code }) => {
        fileCache[fileId] = code;
        socket.to(`file-${fileId}`).emit("code-update", { fileId, code });
    });

    // ── Cursor Move ───────────────────────────────────────────
    socket.on("cursor-move", ({ roomId, fileId, position, selection, userName, color }) => {
        socket.to(`file-${fileId}`).emit("cursor-update", {
            socketId: socket.id, position, selection, userName, color, fileId
        });
    });

    // ── Whiteboard: single stroke broadcast ───────────────────
    socket.on("whiteboard-draw", ({ fileId, stroke }) => {
        socket.to(`file-${fileId}`).emit("whiteboard-update", { stroke });
    });

    // ── Whiteboard: clear board broadcast ────────────────────
    socket.on("whiteboard-clear", ({ fileId }) => {
        wbCache[fileId] = "[]";
        socket.to(`file-${fileId}`).emit("whiteboard-clear");
    });

    // ── Whiteboard: sync full state from client ───────────────
    socket.on("whiteboard-save", ({ fileId, data }) => {
        wbCache[fileId] = data;
    });

    // ── Disconnect ────────────────────────────────────────────
    socket.on("disconnect", () => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit("user-left", { socketId: socket.id });
        }
    });
});

// ── Helper to notify room about file system changes ──────────
const emitFileSystemChange = (roomId) => {
    io.to(roomId).emit("file-system-changed");
};

// ── REST API: File System ─────────────────────────────────────

// Get full folder/file tree for a room
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

// Create folder
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

// Create file
app.post('/api/files', async (req, res) => {
    try {
        const { name, folderId, content, roomId } = req.body;
        const newFile = new File({
            name,
            folderId: folderId || null,
            content: content || '',
            whiteboardData: '[]',
            roomId
        });
        await newFile.save();
        emitFileSystemChange(roomId);
        res.json(newFile);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Rename file or folder
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

// Delete file or folder
app.delete('/api/delete', async (req, res) => {
    try {
        const { id, type } = req.body;
        if (type === 'folder') {
            const f = await Folder.findByIdAndDelete(id);
            if (f) {
                await File.deleteMany({ folderId: id });
                await Folder.deleteMany({ parentId: id });
                emitFileSystemChange(f.roomId);
            }
            res.json({ success: true });
        } else {
            const f = await File.findByIdAndDelete(id);
            if (f) emitFileSystemChange(f.roomId);
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single file content
app.get('/api/files/:id', async (req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) return res.status(404).json({ error: "File not found" });
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update file content + whiteboard data
app.put('/api/files/:id', async (req, res) => {
    try {
        const update = {};
        if (req.body.content !== undefined) update.content = req.body.content;
        if (req.body.whiteboardData !== undefined) update.whiteboardData = req.body.whiteboardData;
        const file = await File.findByIdAndUpdate(req.params.id, update, { new: true });
        res.json(file);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 5000;
server.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));
