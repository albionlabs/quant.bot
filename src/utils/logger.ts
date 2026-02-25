type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel) {
	currentLevel = level;
}

function log(level: LogLevel, message: string, data?: unknown) {
	if (LEVELS[level] < LEVELS[currentLevel]) return;

	const timestamp = new Date().toISOString();
	const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

	if (data !== undefined) {
		console.log(`${prefix} ${message}`, data);
	} else {
		console.log(`${prefix} ${message}`);
	}
}

export const logger = {
	debug: (msg: string, data?: unknown) => log('debug', msg, data),
	info: (msg: string, data?: unknown) => log('info', msg, data),
	warn: (msg: string, data?: unknown) => log('warn', msg, data),
	error: (msg: string, data?: unknown) => log('error', msg, data)
};
