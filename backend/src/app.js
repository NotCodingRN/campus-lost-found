import connectPgSimple from 'connect-pg-simple';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { errorHandler, notFoundHandler } from './errors.js';
import { authRoutes } from './routes/auth.js';
import { claimRoutes } from './routes/claims.js';
import { itemRoutes } from './routes/items.js';
import { meRoutes } from './routes/me.js';
import { healthRoutes, metaRoutes } from './routes/meta.js';
import { loadUser } from './security.js';

export function createApp({ config, pool, google, log = console.log, pruneSessions = true }) {
  const app = express();
  const PgStore = connectPgSimple(session);

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Nginx sits in front of us
  app.use(helmet());

  // Access log: method, path (no query string, so OAuth codes never reach the log), status, time.
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      log(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  });

  app.use(express.json({ limit: '20kb' }));
  app.use('/api', healthRoutes({ pool }));

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: 'user_sessions',
        createTableIfMissing: false,
        pruneSessionInterval: pruneSessions ? 15 * 60 : false,
      }),
      name: 'clf.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use('/api', loadUser(pool));
  app.use('/api', metaRoutes({ pool }));
  app.use('/api/auth', authRoutes({ pool, google, config, log }));
  app.use('/api/items', itemRoutes({ pool }));
  app.use('/api/claims', claimRoutes({ pool }));
  app.use('/api/me', meRoutes({ pool }));

  app.use(notFoundHandler);
  app.use(errorHandler(log));
  return app;
}
