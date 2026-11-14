// Chạy json-server ở chế độ an toàn dữ liệu:  node tools/start-db.mjs  (tùy chọn: --port 3000)
//
// Vì sao: json-server 1.x ở chế độ thường theo dõi db.json và ĐỌC LẠI cả file mỗi khi file đổi.
// Sự kiện "file đổi" đến sau khi một lượt ghi xong; nếu lúc đó có lượt ghi khác đã vào bộ nhớ
// nhưng chưa ghi xuống file, việc đọc lại sẽ ĐÈ MẤT lượt ghi đó (vd đặt hàng xong nhưng kho không bị trừ).
// NODE_ENV=production tắt cơ chế đọc lại này → mọi lượt ghi đều được giữ.
// Đánh đổi: nếu sửa tay db.json khi server đang chạy thì cần khởi động lại server.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portArg = process.argv.indexOf("--port");
const port = portArg > -1 ? process.argv[portArg + 1] : "3000";

// Ở chế độ production, json-server bắt buộc thư mục "public" (file tĩnh) phải tồn tại trong thư mục chạy.
// Dự án không có thư mục này → chạy server trong một thư mục tạm có sẵn "public" rỗng,
// còn db.json vẫn trỏ đúng file của dự án (đường dẫn tuyệt đối).
const runDir = path.join(os.tmpdir(), "lasoi-json-server");
fs.mkdirSync(path.join(runDir, "public"), { recursive: true });
const dbFile = path.join(root, "db.json");

const child = spawn(`npx json-server "${dbFile}" --port ${Number(port) || 3000}`, {
  cwd: runDir,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: "production" },
});
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
