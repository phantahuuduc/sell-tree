// Đo tải json-server (CHỈ ĐỌC — không thay đổi dữ liệu). Cách chạy (json-server phải đang chạy ở cổng 3000):
//   node tools/loadtest.mjs                 → thử 100, 200, 400, 800 khách
//   node tools/loadtest.mjs 100,200,1000    → tự chọn số khách
// Mô phỏng N khách đang mở web: mỗi khách gọi GET /conversations mỗi 2,5s và GET /notifications mỗi 10s
// (đúng nhịp polling của chat.js và notify.js). Đo throughput, độ trễ p50/p95/p99, lỗi.
import http from "node:http";

const BASE = { host: "127.0.0.1", port: 3000 };
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

function get(path) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = http.get({ ...BASE, path, agent, timeout: 10000 }, (res) => {
      let bytes = 0;
      res.on("data", (c) => { bytes += c.length; });
      res.on("end", () => resolve({ ok: res.statusCode === 200, ms: performance.now() - t0, bytes }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, ms: performance.now() - t0, bytes: 0 }); });
    req.on("error", () => resolve({ ok: false, ms: performance.now() - t0, bytes: 0 }));
  });
}

const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : 0;

async function scenario(users, seconds) {
  const lat = [];
  let errors = 0, bytes = 0, done = 0;
  const stopAt = Date.now() + seconds * 1000;
  const loop = async (path, every, offset) => {
    await new Promise((r) => setTimeout(r, offset));
    while (Date.now() < stopAt) {
      const next = Date.now() + every;
      const r = await get(path);
      done++; bytes += r.bytes; lat.push(r.ms); if (!r.ok) errors++;
      const wait = next - Date.now();
      if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    }
  };
  const tasks = [];
  for (let i = 0; i < users; i++) {
    tasks.push(loop("/conversations", 2500, Math.random() * 2500));
    tasks.push(loop("/notifications", 10000, Math.random() * 10000));
  }
  const t0 = Date.now();
  await Promise.all(tasks);
  const elapsed = (Date.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const expected = users * (1 / 2.5 + 1 / 10);
  return {
    users,
    targetRps: +expected.toFixed(1),
    achievedRps: +(done / elapsed).toFixed(1),
    p50: Math.round(pct(lat, 50)), p95: Math.round(pct(lat, 95)), p99: Math.round(pct(lat, 99)),
    errors, mbPerSec: +((bytes / elapsed) / 1e6).toFixed(2),
  };
}

// Đo trần: gửi liên tục không nghỉ với C kết nối song song
async function saturate(path, conc, seconds) {
  const lat = []; let errors = 0;
  const stopAt = Date.now() + seconds * 1000;
  const worker = async () => { while (Date.now() < stopAt) { const r = await get(path); lat.push(r.ms); if (!r.ok) errors++; } };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: conc }, worker));
  lat.sort((a, b) => a - b);
  return { path, conc, rps: Math.round(lat.length / ((Date.now() - t0) / 1000)), p95: Math.round(pct(lat, 95)), errors };
}

const sizes = {};
for (const p of ["/conversations", "/notifications", "/orders", "/products"]) sizes[p] = (await get(p)).bytes;
console.log("Kích thước response (byte):", JSON.stringify(sizes));
console.log("Trần GET /conversations:", JSON.stringify(await saturate("/conversations", 50, 5)));
console.log("Trần GET /orders:", JSON.stringify(await saturate("/orders", 50, 5)));
for (const n of (process.argv[2] || "100,200,400,800").split(",").map(Number)) {
  console.log(JSON.stringify(await scenario(n, 15)));
}
agent.destroy();
