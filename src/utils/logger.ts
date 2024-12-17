import winston from "winston";

const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    const meta = Object.keys(metadata).length ? JSON.stringify(metadata, null, 2) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${meta}`;
});

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
        customFormat
    ),
    transports: [
        new winston.transports.Console({
            stderrLevels: ['error'],
        })
    ],
    exitOnError: false
});

// Log unhandled rejections
process.on('unhandledRejection', (reason: any) => {
    logger.error('Unhandled Rejection', { reason });
});

// Log uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', { error });
    process.exit(1);
});

export default logger; 