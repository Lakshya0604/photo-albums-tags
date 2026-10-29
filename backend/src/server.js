const { createApp } = require('./app');
const { seed } = require('../scripts/seed');

createApp()
  .then(async ({ app, config, db }) => {
    if (process.env.SEED_DEMO === 'true') await seed(config, db);
    app.listen(config.port, () => console.log(`Photo albums running on http://localhost:${config.port}`));
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
