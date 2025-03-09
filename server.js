const express = require('express');
const app = express();
const port = 3000;

// Middleware to parse JSON (if needed for API routes)
app.use(express.json());

// Serve static files from the 'public' folder
app.use(express.static('public'));

// Optional: Explicitly define the root route (not required with express.static)
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});