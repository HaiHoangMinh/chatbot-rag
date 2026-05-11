import { ingestCompanyData } from "../lib/ingest-manager";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function main() {
  console.log("--- BẮT ĐẦU NẠP DỮ LIỆU CÔNG TY ---");
  const result = await ingestCompanyData();
  if (result?.success) {
    console.log(`--- HOÀN THÀNH: Đã nạp ${result.count} files ---`);
  } else {
    console.log("--- THẤT BẠI: Vui lòng kiểm tra log lỗi ---");
  }
}

main().catch(console.error);
