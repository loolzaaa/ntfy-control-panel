'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./config');
const { getDb } = require('./db');
const SqliteSessionStore = require('./sessionStore');
const { requireAuth } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { errorHandler, apiNotFoundHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(express.json({ limit: '128kb' }));

  app.use(
    session({
      name: config.session.cookieName,
      secret: config.session.secret,
      store: new SqliteSessionStore(getDb()),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.session.cookieSecure,
        maxAge: config.session.ttlHours * 60 * 60 * 1000,
      },
    })
  );

  app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', requireAuth, csrfProtection, userRoutes);
  app.use('/api/audit', requireAuth, csrfProtection, auditRoutes);

  app.use(apiNotFoundHandler);

  const distDir = config.clientDistDir;
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }
      if (req.path.startsWith('/api/')) {
        return next();
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
