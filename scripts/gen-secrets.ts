import { randomBytes } from 'crypto';

const SESSION_SECRET = randomBytes(32).toString('hex');
const DEVICE_LOCK_SECRET = randomBytes(32).toString('hex');
const SHARE_TOKEN_SECRET = randomBytes(32).toString('hex');

console.log(`SESSION_SECRET=${SESSION_SECRET}`);
console.log(`DEVICE_LOCK_SECRET=${DEVICE_LOCK_SECRET}`);
console.log(`SHARE_TOKEN_SECRET=${SHARE_TOKEN_SECRET}`);
