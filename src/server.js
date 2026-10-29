const { createApp } = require('./app');

const { app, config } = createApp();
app.listen(config.port, () => console.log(`Photo albums running on http://localhost:${config.port}`));
