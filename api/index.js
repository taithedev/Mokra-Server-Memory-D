import { vercelHandler } from '../backend/server.js';
export default async function handler(req, res) {
  return vercelHandler(req, res);
}
