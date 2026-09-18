'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const config = require('./config');
const { getDb } = require('./db');
const SqliteSessionStore = require('./sessionStore');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { errorHandler, apiNotFoundHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');
const meRoutes = require('./routes/me');
const panelUserRoutes = require('./routes/panelUsers');

function createApp() {
  const app = express();
  const basePath = config.basePath;

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
        path: basePath || '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: config.session.cookieSecure,
        maxAge: config.session.ttlHours * 60 * 60 * 1000,
      },
    })
  );

  const healthHandler = (req, res) => {
    res.json({ status: 'ok' });
  };

  app.get('/healthz', healthHandler);

  if (basePath) {
    app.get('/', (req, res) => {
      res.redirect(`${basePath}/`);
    });
  }

  const appRouter = express.Router();

  appRouter.get('/healthz', healthHandler);
  appRouter.use('/api/auth', authRoutes);
  appRouter.use('/api/me', requireAuth, csrfProtection, meRoutes);
  appRouter.use('/api/users', requireAuth, requireAdmin, csrfProtection, userRoutes);
  appRouter.use('/api/admins', requireAuth, requireAdmin, csrfProtection, panelUserRoutes);
  appRouter.use('/api/audit', requireAuth, requireAdmin, csrfProtection, auditRoutes);

  appRouter.use(apiNotFoundHandler);

  const distDir = config.clientDistDir;
  if (fs.existsSync(distDir)) {
    appRouter.use(express.static(distDir, { index: false }));
    appRouter.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }
      if (req.path.startsWith('/api/')) {
        return next();
      }
      return res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(basePath || '/', appRouter);

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
