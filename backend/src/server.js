const express = require('express');
const app = express();

//GET /monitors
app.get('/api/monitors', (req, res) => {
    //simulate stored data
    const monitors = [];
    res.json({ monitors });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found'});
});

const PORT = process.env.PORT || 5173; 
app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
})