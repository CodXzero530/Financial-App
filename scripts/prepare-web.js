const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "www");
const files = [
  "index.html",
  "manifest.json",
  "service-worker.js",
  "css/app.css",
  "js/app.js",
  "js/db.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-192.png",
  "icons/icon-maskable-512.png"
];

for (const file of files) {
  const source = path.join(root, file);
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

console.log(`Prepared ${files.length} offline app assets in www/.`);
