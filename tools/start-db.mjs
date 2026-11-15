// Chạy json-server cho máy local:  node tools/start-db.mjs  (tùy chọn: --port 3000)
//
// Dùng ĐÚNG phiên bản json-server ghi trong package.json (0.17.4 — cùng bản với máy chủ Render),
// lấy từ node_modules của dự án chứ không qua `npx` (npx sẽ tự tải bản mới nhất 1.x: bản đó bỏ qua `id`
// do trình duyệt gửi lên và tự sinh id khác, làm lệch hành vi giữa local và bản online).
//
// Hai tùy chọn quan trọng (giống hệt lệnh "start" trong package.json):
//   • KHÔNG dùng --watch: ở chế độ theo dõi file, json-server đọc lại db.json sau mỗi lần ghi; lượt ghi tới
//     ngay lúc đó có thể bị đè mất, và trên Windows máy chủ còn có thể sập (EPERM khi đổi tên file).
//     Đánh đổi: sửa tay db.json khi server đang chạy thì phải khởi động lại server.
//   • --fks __none__: tắt việc json-server 0.17 tự xóa "bản ghi mồ côi" mỗi khi có lệnh DELETE
//     (mặc định nó coi mọi trường kết thúc bằng "Id" là khóa ngoại; xóa 1 đơn có thể kéo theo mất banner
//     có promotionId rỗng, giao dịch ví của đơn đã xóa…). Ứng dụng không dùng _expand / _embed nên không ảnh hưởng.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portArg = process.argv.indexOf("--port");
const port = String(Number(portArg > -1 ? process.argv[portArg + 1] : 3000) || 3000);

const pkgDir = path.join(root, "node_modules", "json-server");
const bin = path.join(pkgDir, "lib", "cli", "bin.js");
const wanted = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).dependencies?.["json-server"];

if (!fs.existsSync(bin)) {
  console.error(`Chưa cài json-server ${wanted || ""}. Mở Terminal tại thư mục dự án và chạy:  npm install`);
  process.exit(1);
}
const installed = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
if (wanted && installed !== wanted.replace(/^[^\d]*/, "")) {
  console.warn(`Cảnh báo: đang cài json-server ${installed} nhưng package.json yêu cầu ${wanted}. Chạy "npm install" để đồng bộ.`);
}
console.log(`json-server ${installed} — cổng ${port} — ${path.join(root, "db.json")}`);

const child = spawn(process.execPath, [bin, path.join(root, "db.json"), "--port", port, "--fks", "__none__"], {
  cwd: root,
  stdio: "inherit",
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
