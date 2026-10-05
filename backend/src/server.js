require('dotenv').config();

const app = require('./app');
const connectDatabase = require('./config/database');

const PORT = process.env.PORT || 8080;

const startServer = async () => {
    if (!process.env.JWT_SECRET || !process.env.MONGODB_URI) {
        console.error('Missing JWT_SECRET or MONGODB_URI in .env');
        process.exit(1);
    }

    await connectDatabase();

    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
};

startServer();
