// routes/appConfigRoutes.js
const express = require('express');
const router = express.Router();

router.get('/min-version', (req, res) => {
  res.json({
    minVersion: '1.0.14',
    androidUrl: 'https://play.google.com/store/apps/details?id=es.easyfutbol.app&pcampaignid=web_share',
    iosUrl: 'https://apps.apple.com/es/app/easyfutbol-app/id6758757708',
    message: 'Hay una nueva versión disponible. Actualiza la app para continuar.'
  });
});

module.exports = router;