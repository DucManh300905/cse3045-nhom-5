require('dotenv').config();

const http = require('http');
const app = require('./app');
const connectDatabase = require('./config/database');
const { initSocket } = require('./realtime/socket');
const { startJobs } = require('./jobs');

const PORT = process.env.PORT || 8080;

const startServer = async () => {
    if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
        console.error('Missing JWT_SECRET or MONGODB_URI in .env');
        process.exit(1);
    }

    await connectDatabase();

    // REST + Socket.IO dùng chung một cổng
    const server = http.createServer(app);
    initSocket(server);
    startJobs();

    server.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
};

startServer();
