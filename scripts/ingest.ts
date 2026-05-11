import { ingestCompanyData } from "../lib/ingest-manager";
import * as dotenv from "dotenv";

// CHỈ load .env nếu đang chạy ở máy local (không có biến môi trường hệ thống)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

async function main() {
  console.log("--- BẮT ĐẦU NẠP DỮ LIỆU CÔNG TY ---");
  
  // Log thử để kiểm tra (Xóa sau khi chạy xong để bảo mật)
  if (process.env.GOOGLE_API_KEY) {
    
    console.log("Tìm thấy API Key: ", process.env.GOOGLE_API_KEY.substring(0, 5) + "...");
  } else {
    console.error("CẢNH BÁO: Không tìm thấy GOOGLE_API_KEY trong process.env");
  }

  const result = await ingestCompanyData();
  if (result?.success) {
    console.log(`--- HOÀN THÀNH: Đã nạp ${result.count} files ---`);
  } else {
    console.log("--- THẤT BẠI: Vui lòng kiểm tra log lỗi ---");
  }
}

main().catch(console.error); 