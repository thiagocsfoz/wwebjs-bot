import P from 'pino';

export const log = P({ timestamp: () => `,"time":"${new Date().toJSON()}"` })
