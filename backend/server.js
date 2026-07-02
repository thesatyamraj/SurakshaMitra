require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('dotenv').config();

const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose  = require('mongoose');
const { initSocket } = require('./socket');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;

initSocket(server);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  exposedHeaders: ['X-Auth-Token'],
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting tiers (PRD §11.1)
const globalLimiter  = rateLimit({ windowMs: 60*1000, max: 200, standardHeaders: true, message: { success:false, error:'Too many requests.' } });
const ratingsLimiter = rateLimit({ windowMs: 60*60*1000, max: 40, message: { success:false, error:'Rating limit reached.' } });
app.use(globalLimiter);

app.use('/api/auth',          require('./routes/auth'));
app.use('/api/sos',           require('./routes/sos'));
app.use('/api/locations',     require('./routes/locations'));
app.use('/api/ratings',       ratingsLimiter, require('./routes/ratings'));
app.use('/api/survey',        require('./routes/survey'));
app.use('/api/incidents',     require('./routes/incidents'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/safezones',     require('./routes/safezones'));
app.use('/api/chat',          require('./routes/chat'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', service: 'SurakshaMitra Unified API', version: '1.0.0',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date(),
    features: {
      sos: true, liveTracking: true, sti: true, trs: true, regression: true,
      heatmap: true, incidents: true, notifications: true,
      ai: !!process.env.GEMINI_API_KEY,
      email: !!process.env.SMTP_HOST,
      cloudinary: !!process.env.CLOUDINARY_URL,
      sms: process.env.TWILIO_ENABLED === 'true',
      push: !!process.env.VAPID_PUBLIC_KEY,
    },
  });
});

app.use((req, res) => res.status(404).json({ success: false, error: `${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/surakshamitra';
mongoose.connect(MONGO_URI).then(() => {
  console.log('✅ MongoDB connected');
  server.listen(PORT, () => {
    console.log(`\n🛡  SurakshaMitra Unified API → http://localhost:${PORT}`);
    console.log(`   SOS + Live Tracking · STI/TRS engine · Heatmap · Incidents · Notifications\n`);
  });
}).catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

module.exports = app;
