const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// Create 'codes' folder if it doesn't exist
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
    const outPath = path.join(codesDir, "temp.exe"); // Use .out if on Linux/Mac

    // 1. Write the code to a file
    fs.writeFileSync(filePath, code);

    // 2. Compile and Run
    // Command: Compile -> Run -> Delete executable (to keep it clean)
    const command = `g++ "${filePath}" -o "${outPath}" && "${outPath}"`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            // Send back compilation or runtime errors (stderr)
            return res.send({ output: stderr || error.message });
        }
        // Send back the program output
        res.send({ output: stdout });
    });
});

const PORT = 5000;
app.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));
