"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Upload, User, Loader2, Paperclip, Building2, Factory, Trash2 } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
};

// Samkwang Brand Colors
const SAMKWANG_BLUE = "#0530A1";
const SAMKWANG_RED = "#950D0F";

export default function ChatbotPage() {
  const [messages, setMessages] = useState<Message[]>([
    { id: "1", role: "ai", content: "Xin chào! Tôi là trợ lý AI của Samkwang. Tôi có thể giúp bạn tra cứu thông tin dựa trên dữ liệu nội bộ của công ty. Bạn muốn tìm hiểu về quy trình sản xuất, quản lý chất lượng hay thông tin gì?" },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const isInitialized = useRef(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load history from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem("samkwang_chat_history");
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error("Failed to parse chat history:", e);
      }
    }
    isInitialized.current = true;
  }, []);

  // Save history to localStorage on every change (after initialization)
  useEffect(() => {
    if (isInitialized.current) {
      localStorage.setItem("samkwang_chat_history", JSON.stringify(messages));
    }
    scrollToBottom();
  }, [messages, isLoading]);

  const clearHistory = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện không?")) {
      const defaultMessage: Message[] = [
        { id: "1", role: "ai", content: "Xin chào! Tôi là trợ lý AI của Samkwang. Tôi có thể giúp bạn tra cứu thông tin dựa trên dữ liệu nội bộ của công ty. Bạn muốn tìm hiểu về quy trình sản xuất, quản lý chất lượng hay thông tin gì?" },
      ];
      setMessages(defaultMessage);
      localStorage.setItem("samkwang_chat_history", JSON.stringify(defaultMessage));
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessageContent = input.trim();
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessageContent,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }, 0);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          question: userMessageContent,
          stream: true 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "API call failed");
      }

      const aiMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: aiMessageId, role: "ai", content: "" }]);
      
      setIsLoading(false);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) throw new Error("Không thể khởi tạo luồng dữ liệu.");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        setMessages((prev) => 
          prev.map((msg) => 
            msg.id === aiMessageId 
              ? { ...msg, content: msg.content + chunk } 
              : msg
          )
        );
      }
    } catch (error: any) {
      console.error("Chat Error:", error);
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "ai", content: `❌ Lỗi: ${error.message}` }
      ]);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message || `File "${file.name}" successfully uploaded!`);
      } else {
        alert(`Lỗi upload: ${data.error}`);
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Đã xảy ra lỗi khi upload file.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="flex h-screen bg-[#F4F7FA] flex-col font-sans antialiased text-gray-900">
      {/* Samkwang Header */}
      <header className="bg-white shadow-md py-4 px-8 flex justify-between items-center border-b-2 border-[#0530A1] z-10 sticky top-0">
        <div className="flex items-center gap-4">
          <div 
            className="flex items-center justify-center p-1 rounded-lg overflow-hidden bg-white shadow-sm border border-gray-100"
          >
            <img src="/images.png" alt="Samkwang Logo" className="w-10 h-auto object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2" style={{ color: SAMKWANG_BLUE }}>
              SAMKWANG <span style={{ color: SAMKWANG_RED }}>VINA</span>
            </h1>
            <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-gray-400">Smart Manufacturing Assistant</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={clearHistory}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:bg-gray-100 active:scale-95"
            style={{ color: SAMKWANG_RED }}
          >
            <Trash2 className="w-4 h-4" />
            XÓA LỊCH SỬ
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col max-w-5xl w-full mx-auto p-4 md:p-8">
        <div className="flex-1 overflow-y-auto space-y-8 pr-4 custom-scrollbar">
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex items-start gap-5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div 
                className={`p-2.5 rounded-xl mt-1 shrink-0 shadow-lg ${msg.role === 'user' ? 'bg-gray-800' : ''}`}
                style={msg.role === 'ai' ? { backgroundColor: SAMKWANG_BLUE } : {}}
              >
                {msg.role === 'user' ? (
                  <User className="w-5 h-5 text-white" />
                ) : (
                  <Bot className="w-5 h-5 text-white" />
                )}
              </div>
              <div 
                className={`p-5 shadow-xl max-w-[80%] text-[15px] leading-relaxed border
                  ${msg.role === 'user' 
                    ? 'bg-gray-800 text-white rounded-3xl rounded-tr-none border-gray-700' 
                    : 'bg-white rounded-3xl rounded-tl-none text-gray-800 border-gray-100'
                  }`}
              >
                <div className="whitespace-pre-wrap font-medium">
                  {msg.content || (msg.role === 'ai' && (
                    <div className="flex gap-1.5 py-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:-0.3s]"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-5">
              <div 
                className="p-2.5 rounded-xl mt-1 shrink-0 shadow-lg"
                style={{ backgroundColor: SAMKWANG_BLUE }}
              >
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-3xl rounded-tl-none p-5 shadow-xl flex items-center gap-4 text-gray-500">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: SAMKWANG_RED }}></div>
                  <div className="w-2 h-2 rounded-full animate-pulse [animation-delay:-0.2s]" style={{ backgroundColor: SAMKWANG_BLUE }}></div>
                  <div className="w-2 h-2 rounded-full animate-pulse [animation-delay:-0.4s]" style={{ backgroundColor: SAMKWANG_RED }}></div>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#0530A1]">Đang truy xuất dữ liệu Samkwang...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Action Area */}
        <div className="mt-6 pt-6 relative border-t border-gray-200">
          <form 
            onSubmit={handleSend}
            className="relative flex items-center gap-3 bg-white rounded-3xl border-2 border-gray-100 shadow-2xl focus-within:border-[#0530A1] transition-all overflow-hidden p-2.5"
          >
            <div className="flex items-center justify-center p-3 text-gray-400 hover:text-[#0530A1] cursor-pointer transition-colors">
               <Paperclip className="w-5 h-5" />
            </div>
            <textarea 
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              className="w-full max-h-32 min-h-[48px] resize-none outline-none py-3 px-1 text-gray-700 bg-transparent text-base font-medium placeholder:text-gray-300"
              placeholder="Nhập câu hỏi về Samkwang tại đây..."
              rows={1}
              disabled={isLoading}
              autoFocus
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`p-4 rounded-2xl transition-all shrink-0 flex items-center justify-center shadow-lg
                ${!input.trim() || isLoading 
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed shadow-none' 
                  : 'text-white hover:brightness-110 active:scale-95'
                }`}
              style={(!input.trim() || isLoading) ? {} : { backgroundColor: SAMKWANG_BLUE }}
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <div className="flex justify-center gap-6 mt-4">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Manufacturing Excellence</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Precision Engineering</p>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Global Samkwang</p>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #D1D5DB; border-radius: 20px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #0530A1; }
      `}} />
    </div>
  );
}
