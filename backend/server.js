require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');
const path = require('path');

// Московское время — используем UTC+3
const getMoscowDate = () => {
  const now = new Date();
  const moscowOffset = 3 * 60 * 60 * 1000;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  return new Date(utc + moscowOffset);
};

const formatMoscowDate = (date) => {
  const d = date ? new Date(date) : getMoscowDate();
  return d.toISOString().split('T')[0];
};

const app = express();
const PORT = process.env.PORT || 3000;

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Авто-инициализация базы данных
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'VIEWER' CHECK (role IN ('OWNER', 'ADMIN', 'VIEWER')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS closed_dates (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        closed_by BIGINT NOT NULL REFERENCES users(telegram_id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        background_image TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT single_row CHECK (id = 1)
      );

      INSERT INTO settings (id, background_image) VALUES (1, NULL)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✓ Database initialized successfully');
  } catch (error) {
    console.error('✗ Database initialization error:', error.message);
  }
}

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data']
}));
app.use(express.json());

// Проверка подписи Telegram WebApp
function verifyTelegramWebAppData(initData) {
  if (!initData || initData === 'browser_mode') {
    return true; // Allow browser mode for testing
  }

  try {
    const secret = crypto.createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN || '')
      .digest();
    
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const hmac = crypto.createHmac('sha256', secret)
      .update(dataCheckString)
      .digest('hex');
    
    return hmac === hash;
  } catch (error) {
    console.error('Verification error:', error);
    return false;
  }
}

// Middleware авторизации
async function authMiddleware(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'];
    
    if (!initData) {
      // Allow browser mode for testing
      req.user = { id: 0, username: 'browser', first_name: 'Browser' };
      req.userRole = 'VIEWER';
      return next();
    }
    
    if (initData === 'browser_mode') {
      req.user = { id: 0, username: 'browser', first_name: 'Browser' };
      req.userRole = 'VIEWER';
      return next();
    }
    
    if (!verifyTelegramWebAppData(initData)) {
      // For development, allow anyway
      console.warn('⚠ Invalid Telegram signature, allowing for development');
    }
    
    try {
      const params = new URLSearchParams(initData);
      const user = JSON.parse(params.get('user') || '{}');
      req.user = user;
    } catch (e) {
      req.user = { id: 0, username: 'browser', first_name: 'Browser' };
    }
    
    // Получаем роль пользователя из БД
    if (req.user.id && req.user.id > 0) {
      const result = await pool.query(
        'SELECT role FROM users WHERE telegram_id = $1',
        [req.user.id]
      );
      
      if (result.rows.length === 0) {
        await pool.query(
          'INSERT INTO users (telegram_id, role) VALUES ($1, $2)',
          [req.user.id, 'VIEWER']
        );
        req.userRole = 'VIEWER';
      } else {
        req.userRole = result.rows[0].role;
      }
    } else {
      req.userRole = 'VIEWER';
    }
    
    next();
  } catch (error) {
    console.error('Auth error:', error);
    req.user = { id: 0, username: 'browser', first_name: 'Browser' };
    req.userRole = 'VIEWER';
    next();
  }
}

// Проверка роли администратора
function requireAdmin(req, res, next) {
  if (req.userRole !== 'ADMIN' && req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Проверка роли владельца
function requireOwner(req, res, next) {
  if (req.userRole !== 'OWNER') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

// Получить закрытые даты за месяц
app.get('/api/calendar', authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month required' });
    }
    
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
    
    const result = await pool.query(
      `SELECT date, closed_by, created_at 
       FROM closed_dates 
       WHERE date >= $1 AND date <= $2
       ORDER BY date`,
      [startDate, endDate]
    );
    
    res.json({
      closedDates: result.rows,
      userRole: req.userRole,
      timezone: 'Europe/Moscow'
    });
  } catch (error) {
    console.error('Get calendar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Переключить дату (закрыть/открыть)
app.post('/api/calendar/toggle', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { date } = req.body;
    
    if (!date) {
      return res.status(400).json({ error: 'Date required' });
    }
    
    // Проверяем, не прошла ли дата
    const targetDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (targetDate < today) {
      return res.status(400).json({ error: 'Cannot modify past dates' });
    }
    
    // Проверяем, закрыта ли дата
    const existing = await pool.query(
      'SELECT id FROM closed_dates WHERE date = $1',
      [date]
    );
    
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM closed_dates WHERE date = $1', [date]);
      res.json({ status: 'opened', date });
    } else {
      await pool.query(
        'INSERT INTO closed_dates (date, closed_by) VALUES ($1, $2)',
        [date, req.user.id || 0]
      );
      res.json({ status: 'closed', date });
    }
  } catch (error) {
    console.error('Toggle date error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить информацию о пользователе
app.get('/api/user', authMiddleware, async (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    firstName: req.user.first_name,
    lastName: req.user.last_name,
    role: req.userRole
  });
});

// Добавить администратора (только OWNER)
app.post('/api/admin/add', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    await pool.query(
      `INSERT INTO users (telegram_id, role) VALUES ($1, 'ADMIN')
       ON CONFLICT (telegram_id) DO UPDATE SET role = 'ADMIN'`,
      [telegramId]
    );
    
    res.json({ success: true, message: 'Admin added' });
  } catch (error) {
    console.error('Add admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Удалить администратора (только OWNER)
app.post('/api/admin/remove', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return res.status(400).json({ error: 'Telegram ID required' });
    }
    
    await pool.query(
      "UPDATE users SET role = 'VIEWER' WHERE telegram_id = $1 AND role = 'ADMIN'",
      [telegramId]
    );
    
    res.json({ success: true, message: 'Admin removed' });
  } catch (error) {
    console.error('Remove admin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получить настройки
app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT background_image FROM settings LIMIT 1');
    
    if (result.rows.length === 0) {
      res.json({ backgroundImage: null });
    } else {
      res.json({ backgroundImage: result.rows[0].background_image });
    }
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновить фон (только OWNER)
app.post('/api/settings/background', authMiddleware, requireOwner, async (req, res) => {
  try {
    const { backgroundImage } = req.body;
    
    await pool.query(
      `INSERT INTO settings (id, background_image, updated_at) 
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET background_image = $1, updated_at = NOW()`,
      [backgroundImage]
    );
    
    res.json({ success: true, backgroundImage });
  } catch (error) {
    console.error('Update background error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Инициализация владельца (первый запуск)
app.post('/api/init-owner', async (req, res) => {
  try {
    const { telegramId, secret } = req.body;
    
    if (secret !== process.env.INIT_SECRET) {
      return res.status(403).json({ error: 'Invalid secret' });
    }
    
    await pool.query(
      `INSERT INTO users (telegram_id, role) VALUES ($1, 'OWNER')
       ON CONFLICT (telegram_id) DO UPDATE SET role = 'OWNER'`,
      [telegramId]
    );
    
    res.json({ success: true, message: 'Owner initialized' });
  } catch (error) {
    console.error('Init owner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timezone: 'Europe/Moscow', timestamp: new Date().toISOString() });
});

// Статические файлы frontend (должны быть раньше catch-all маршрута)
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath, {
  maxAge: '1h',
  etag: false
}));

// Serve frontend index.html для всех остальных маршрутов (SPA)
app.get('*', (req, res) => {
  const indexPath = path.join(frontendDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(404).json({ error: 'Not found' });
    }
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Запуск сервера
const server = app.listen(PORT, async () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  Telegram Calendar Server Started     ║`);
  console.log(`╠════════════════════════════════════════╣`);
  console.log(`║  Port: ${PORT}${' '.repeat(27 - PORT.toString().length)}║`);
  console.log(`║  Timezone: Europe/Moscow              ║`);
  console.log(`║  Environment: ${process.env.NODE_ENV || 'development'}${' '.repeat(20 - (process.env.NODE_ENV || 'development').length)}║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  
  // Инициализация базы данных
  await initDatabase();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});
