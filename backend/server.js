const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const mongoose = require("mongoose");
const Folder = require("./models/Folder");
const File = require("./models/File");
const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect("mongodb+srv://vanshika9dhiman_db_user:E4tkOkBuVF2DZANp@first.tzaxesy.mongodb.net/?appName=First")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB Connection Error:", err));

const codesDir = path.join(__dirname, "codes");
if (!fs.existsSync(codesDir)) {
    fs.mkdirSync(codesDir);
}
app.post('/run', (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).send({ output: "No code provided" });
    }
    const filePath = path.join(codesDir, "temp.cpp");
    const outPath = path.join(codesDir, "temp.exe");
    //  Write the code to a file
    fs.writeFileSync(filePath, code);
    //  Compile and Run
    const command = `g++ "${filePath}" -o "${outPath}" && "${outPath}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.send({ output: stderr || error.message });
        }
        res.send({ output: stdout });
    });
});

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
            res.json(f);
        } else {
            const f = await File.findByIdAndUpdate(id, { name: newName }, { new: true });
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
            await Folder.findByIdAndDelete(id);
            // Delete all subfiles and subfolders recursively (basic version: just delete this folder and its immediate children. A full recursion is omitted for simplicity)
            await File.deleteMany({ folderId: id });
            await Folder.deleteMany({ parentId: id });
            res.json({ success: true });
        } else {
            await File.findByIdAndDelete(id);
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
app.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));

