# Telegram Calendar Mini App

A Telegram Mini App for managing a booking calendar with role-based access control, Moscow timezone support, and a dark high-tech design.

## Features

- 📅 **Calendar Management** - Full month view with Moscow timezone (MSK) support
- 🔴 **Date Status** - Mark dates as open (cyan) or closed (red)
- 👥 **Role-Based Access** - Three user roles with different permissions:
  - **OWNER** - Full access, manage administrators
  - **ADMIN** - Toggle date status
  - **VIEWER** - View only
- 🎨 **Dark High-Tech Design** - Modern, sleek interface with smooth animations
- 📱 **Responsive Design** - Works on all devices
- 🖼️ **Customizable Background** - Change calendar background image
- 🔒 **Secure** - Telegram WebApp signature verification

## Technology Stack

**Backend:**
- Node.js + Express
- PostgreSQL
- Telegram WebApp SDK

**Frontend:**
- React 18
- Vite
- TailwindCSS
- Day.js (timezone support)

## Project Structure

```
telegram-calendar/
├── backend/
│   ├── server.js          # Main Express server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Main React component
│   │   ├── main.jsx       # Entry point
│   │   └── index.css      # Styles
│   ├── index.html         # HTML template
│   ├── vite.config.js     # Vite configuration
│   ├── tailwind.config.js # Tailwind configuration
│   └── package.json
├── Dockerfile             # Docker build configuration
├── package.json           # Root package.json
└── README.md
```

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd telegram-calendar
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd backend
   npm install
   cd ..

   # Frontend
   cd frontend
   npm install
   cd ..
   ```

3. **Configure environment**
   ```bash
   # Create .env file in root
   cp .env.example .env
   
   # Edit .env with your values:
   # - DATABASE_URL: PostgreSQL connection string
   # - BOT_TOKEN: Your Telegram bot token
   # - INIT_SECRET: Random secret for owner initialization
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Backend
   cd backend
   npm run dev

   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

5. **Access the app**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000/api

## Deployment on Railway

### Step 1: Prepare Repository

```bash
# Initialize git repository if not already done
git init
git add .
git commit -m "Initial commit"
git push origin main
```

### Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Connect your repository

### Step 3: Add PostgreSQL Database

1. In Railway Dashboard, click "Add Service"
2. Select "PostgreSQL"
3. Wait for database to initialize

### Step 4: Configure Environment Variables

In Railway Dashboard → Variables, add:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
BOT_TOKEN=your_bot_token_from_botfather
WEBAPP_URL=https://your-app-name.up.railway.app
INIT_SECRET=random_string_for_security
NODE_ENV=production
PORT=3000
```

### Step 5: Deploy

1. Railway automatically deploys when you push to main branch
2. Wait for build to complete
3. Your app will be available at `https://your-app-name.up.railway.app`

### Step 6: Initialize Owner

After deployment, initialize the owner account:

```bash
curl -X POST https://your-app-name.up.railway.app/api/init-owner \
  -H "Content-Type: application/json" \
  -d '{
    "telegramId": YOUR_TELEGRAM_ID,
    "secret": "your_init_secret"
  }'
```

## Telegram Bot Setup

1. **Create Bot**
   - Write to [@BotFather](https://t.me/botfather) in Telegram
   - Send `/newbot`
   - Follow instructions to create a new bot
   - Save the BOT_TOKEN

2. **Enable Web App**
   - Send `/mybots` to @BotFather
   - Select your bot
   - Select "Bot Settings"
   - Select "Menu Button"
   - Select "Configure menu button"
   - Set Web App URL to your deployment URL

3. **Test**
   - Open your bot in Telegram
   - Click the menu button
   - Your calendar app should open

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/calendar?year=2024&month=3` | Get closed dates for month | Required |
| POST | `/api/calendar/toggle` | Toggle date open/closed | Admin+ |
| GET | `/api/user` | Get current user info | Required |
| GET | `/api/settings` | Get app settings | Required |
| POST | `/api/settings/background` | Update background image | Owner |
| POST | `/api/admin/add` | Add admin user | Owner |
| POST | `/api/admin/remove` | Remove admin user | Owner |
| POST | `/api/init-owner` | Initialize owner (first run) | Public |
| GET | `/api/health` | Health check | Public |

## Authentication

All endpoints (except `/api/init-owner` and `/api/health`) require the `X-Telegram-Init-Data` header containing the Telegram WebApp initialization data.

The server verifies the signature using the bot token to ensure requests come from legitimate Telegram WebApp instances.

## Browser Mode

For development/testing without Telegram, the app supports browser mode:
- Set `X-Telegram-Init-Data: browser_mode` header
- Default role: VIEWER
- Useful for UI testing

## Troubleshooting

### Black Screen on Railway

**Common causes:**
1. Frontend not built - ensure `npm run build` completes successfully
2. API URL mismatch - frontend can't reach backend
3. Database not initialized - check DATABASE_URL is correct
4. Missing environment variables - verify all required vars are set

**Solutions:**
1. Check Railway build logs for errors
2. Verify DATABASE_URL is accessible
3. Ensure frontend/dist folder exists after build
4. Check backend server logs: `railway logs`

### Calendar Not Loading

1. Check browser console for errors
2. Verify Telegram WebApp SDK is loaded
3. Check `/api/health` endpoint returns 200
4. Verify database connection in backend logs

### Dates Not Toggling

1. Ensure user has ADMIN or OWNER role
2. Check user was created in database
3. Verify `X-Telegram-Init-Data` header is sent
4. Check backend logs for errors

## Security Notes

- All API requests verify Telegram signature
- Passwords and tokens stored in environment variables
- Database uses SSL in production
- Past dates cannot be modified
- Role-based access control enforced server-side

## License

MIT

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Railway logs
3. Check backend console output
4. Verify environment configuration

## Development Tips

- Use `npm run dev:backend` and `npm run dev:frontend` for local development
- Frontend proxy is configured to `/api` routes in vite.config.js
- Database schema is auto-initialized on first server start
- Day.js is configured for Moscow timezone (Europe/Moscow)
