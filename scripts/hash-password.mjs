import { randomBytes, scryptSync } from "node:crypto";
import process from "node:process";

const password = process.argv[2];
if (!password || password.length < 12) {
  throw new Error("Pass a password of at least 12 characters as the first argument.");
}
const salt = randomBytes(16).toString("hex");
const derived = scryptSync(password, salt, 64).toString("hex");
process.stdout.write(`scrypt$${salt}$${derived}\n`);

