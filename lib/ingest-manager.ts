import fs from "fs";
import path from "path";
import { ingestData } from "./chroma";

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { message: String(err) };
}

/**
 * Tự động nạp dữ liệu từ thư mục data/company
 * Hỗ trợ .txt và .md mặc định.
 */
export async function ingestCompanyData() {
  const directoryPath = path.join(process.cwd(), "data/company");
  
  if (!fs.existsSync(directoryPath)) {
    console.log("Thư mục data/company không tồn tại. Bỏ qua nạp dữ liệu.");
    return { success: false, error: "Directory not found" };
  }

  console.log(`Đang quét dữ liệu tại: ${directoryPath}`);

  try {
    const files = fs.readdirSync(directoryPath);
    let count = 0;

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isFile()) {
        const ext = path.extname(file).toLowerCase();
        
        // Chỉ xử lý file văn bản thuần túy cho bản demo này
        if (['.txt', '.md', '.json'].includes(ext)) {
          console.log(`Đang nạp file: ${file}`);
          const content = fs.readFileSync(filePath, 'utf-8');
          
          await ingestData(content, {
            metadata: { source: file, company_data: true },
            collectionName: process.env.CHROMA_COLLECTION || "chatbot",
          });
          count++;
        } else {
          console.log(`Bỏ qua file (cần thư viện chuyên dụng cho PDF/DOCX): ${file}`);
        }
      }
    }

    return { success: true, count };
  } catch (error) {
    const serialized = serializeError(error);
    console.error("Lỗi khi nạp dữ liệu từ thư mục:", serialized);
    return { success: false, error: serialized };
  }
}
