"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Upload, X, FileText, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Loader2,
  Settings2
} from "lucide-react";
import { Category } from "@/types";
import { toast } from "sonner";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onSuccess: () => void;
  userRole?: string; // 用户角色：admin, volunteer, guest
}

// 从文件名提取标题
function extractTitleFromFileName(fileName: string): string {
  let title = fileName.replace(/\.[^/.]+$/, "");
  title = title.replace(/[_\.]+/g, " ");
  title = title.replace(/\s+/g, " ").trim();
  return title;
}

  // 单个文件项的状态
interface FileItem {
  id: string;
  file: File;
  title: string;
  categoryId: string;
  description: string;
  semester: string;
  course: string;
  expanded: boolean;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  progress?: number; // 上传进度 0-100
  speed?: string; // 上传速度
  retryCount?: number; // 重试次数
}

export default function FileUploadDialog({
  open,
  onOpenChange,
  categories,
  onSuccess,
  userRole = "guest",
}: FileUploadDialogProps) {
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 根据角色限制上传数量：访客5个，管理员/志愿者100个
  const isAdminOrVolunteer = userRole === "admin" || userRole === "volunteer";
  const MAX_FILES = isAdminOrVolunteer ? 100 : 5;
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  
  // 文件大小验证
  const validateFileSize = (file: File): boolean => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`文件 "${file.name}" 超过100MB限制`);
      return false;
    }
    return true;
  };

  // 批量操作状态
  const [batchCategory, setBatchCategory] = useState<string>("");
  const [batchSemester, setBatchSemester] = useState<string>("");
  const [batchCourse, setBatchCourse] = useState<string>("");
  const [allExpanded, setAllExpanded] = useState(false);

  // 重置状态
  useEffect(() => {
    if (!open) {
      setFileItems([]);
      setBatchCategory("");
      setBatchSemester("");
      setBatchCourse("");
      setAllExpanded(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  }, [open]);

  // 处理文件添加
  const addFiles = (newFiles: FileList | File[]) => {
    const filesArray = Array.from(newFiles);
    const currentCount = fileItems.length;
    const availableSlots = MAX_FILES - currentCount;
    
    if (availableSlots <= 0) {
      toast.error(`最多只能上传 ${MAX_FILES} 个文件`);
      return;
    }
    
    // 过滤超过大小限制的文件
    const validFiles = filesArray.filter(file => validateFileSize(file));
    
    if (validFiles.length === 0) {
      return;
    }
    
    const filesToAdd = validFiles.slice(0, availableSlots);
    
    if (filesToAdd.length < filesArray.length) {
      toast.warning(`只添加了 ${filesToAdd.length} 个文件，已达到上限 ${MAX_FILES}`);
    }
    
    const newItems: FileItem[] = filesToAdd.map(file => {
      const extractedTitle = extractTitleFromFileName(file.name);
      
      return {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        title: extractedTitle,
        categoryId: batchCategory || "", // 如果有批量分类则使用
        description: "",
        semester: batchSemester,
        course: batchCourse,
        expanded: false,
        status: "pending" as const,
      };
    });
    
    setFileItems(prev => [...prev, ...newItems]);
    
    if (filesToAdd.length > 0) {
      toast.success(`已添加 ${filesToAdd.length} 个文件`);
    }
  };

  // 更新文件项
  const updateFileItem = (id: string, updates: Partial<FileItem>) => {
    setFileItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  // 切换展开状态
  const toggleExpand = (id: string) => {
    setFileItems(prev => prev.map(item => 
      item.id === id ? { ...item, expanded: !item.expanded } : item
    ));
  };

  // 全部展开/收起
  const toggleAllExpanded = () => {
    const newState = !allExpanded;
    setAllExpanded(newState);
    setFileItems(prev => prev.map(item => 
      item.status === "pending" ? { ...item, expanded: newState } : item
    ));
  };

  // 移除文件项
  const removeFileItem = (id: string) => {
    setFileItems(prev => prev.filter(item => item.id !== id));
  };

  // 清空所有文件
  const clearAllFiles = () => {
    if (confirm("确定要清空所有文件吗？")) {
      setFileItems([]);
    }
  };

  // 批量设置分类
  const applyBatchCategory = () => {
    if (!batchCategory) {
      toast.error("请先选择分类");
      return;
    }
    setFileItems(prev => prev.map(item => 
      item.status === "pending" ? { ...item, categoryId: batchCategory } : item
    ));
    toast.success(`已为所有文件设置分类`);
  };

  // 批量设置学期
  const applyBatchSemester = () => {
    if (!batchSemester.trim()) {
      toast.error("请输入学期");
      return;
    }
    setFileItems(prev => prev.map(item => 
      item.status === "pending" ? { ...item, semester: batchSemester } : item
    ));
    toast.success(`已为所有文件设置学期`);
  };

  // 批量设置课程
  const applyBatchCourse = () => {
    if (!batchCourse.trim()) {
      toast.error("请输入课程名称");
      return;
    }
    setFileItems(prev => prev.map(item => 
      item.status === "pending" ? { ...item, course: batchCourse } : item
    ));
    toast.success(`已为所有文件设置课程`);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB 每块，适配 Vercel 请求体限制
  const CHUNK_CONCURRENCY = 2;
  const LARGE_FILE_THRESHOLD = 1 * 1024 * 1024; // 1MB 以上使用分块上传，提升上线稳定性

  const runWithConcurrency = async <T, U>(
    items: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<U>
  ): Promise<U[]> => {
    const results: U[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.max(1, limit) }, async () => {
      while (true) {
        const current = nextIndex++;
        if (current >= items.length) return;
        results[current] = await mapper(items[current], current);
      }
    });

    await Promise.all(workers);
    return results;
  };

  // 分块上传函数
  const uploadFileChunked = async (
    file: File,
    metadata: { title: string; description: string; categoryId: string; semester: string; course: string; tags: string[] },
    token: string,
    onProgress: (progress: number, speed: string) => void
  ): Promise<{ success: boolean }> => {
    // 1. 初始化分块上传
    const initResponse = await fetch("/api/files/upload-chunked", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "x-upload-action": "init",
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        title: metadata.title,
        description: metadata.description,
        categoryId: metadata.categoryId,
        semester: metadata.semester,
        course: metadata.course,
        tags: metadata.tags,
      }),
    });

    if (!initResponse.ok) {
      const error = await initResponse.json();
      throw new Error(error.error || "初始化上传失败");
    }

    const { sessionId, totalChunks: chunks } = await initResponse.json();
    
    // 2. 并发上传每个分块（有限并发，提升大文件速度）
    let uploadedBytes = 0;
    let lastTime = Date.now();
    let lastUploadedBytes = 0;

    await runWithConcurrency(Array.from({ length: chunks }, (_, i) => i), CHUNK_CONCURRENCY, async (i) => {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("chunkIndex", i.toString());
      formData.append("chunk", chunk);

      const chunkResponse = await fetch("/api/files/upload-chunked", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "x-upload-action": "chunk",
        },
        body: formData,
      });

      if (!chunkResponse.ok) {
        const error = await chunkResponse.json();
        throw new Error(error.error || `分块 ${i + 1} 上传失败`);
      }

      // 更新进度
      uploadedBytes += (end - start);
      const progress = Math.round((uploadedBytes / file.size) * 100);
      
      // 计算速度
      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      const bytesSinceLast = uploadedBytes - lastUploadedBytes;
      const speed = elapsed > 0 ? bytesSinceLast / elapsed : 0;
      lastTime = now;
      lastUploadedBytes = uploadedBytes;

      let speedText = "";
      if (speed > 1024 * 1024) {
        speedText = `${(speed / 1024 / 1024).toFixed(1)} MB/s`;
      } else if (speed > 1024) {
        speedText = `${(speed / 1024).toFixed(1)} KB/s`;
      } else {
        speedText = `${speed.toFixed(0)} B/s`;
      }

      onProgress(progress, speedText);
    });

    // 3. 完成上传
    const completeResponse = await fetch("/api/files/upload-chunked", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "x-upload-action": "complete",
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!completeResponse.ok) {
      const error = await completeResponse.json();
      throw new Error(error.error || "完成上传失败");
    }

    return { success: true };
  };

  // 上传单个文件（带进度跟踪）- 支持大文件分块上传
  const uploadSingleFile = (
    item: FileItem,
    onProgress: (progress: number, speed: string) => void
  ): Promise<{ success: boolean; compression?: { originalSize: number; compressedSize: number; ratio: string } }> => {
    return new Promise(async (resolve, reject) => {
      const token = localStorage.getItem("token");
      
      if (!token) {
        reject(new Error("请先登录"));
        return;
      }

      // 大文件使用分块上传
      if (item.file.size > LARGE_FILE_THRESHOLD) {
        console.log(`使用分块上传: ${item.file.name} (${(item.file.size / 1024 / 1024).toFixed(1)}MB)`);
        try {
          const result = await uploadFileChunked(
            item.file,
            {
              title: item.title,
              description: item.description,
              categoryId: item.categoryId,
              semester: item.semester,
              course: item.course,
              tags: [],
            },
            token,
            onProgress
          );
          resolve(result);
        } catch (error) {
          reject(error);
        }
        return;
      }

      // 小文件直接上传
      const formData = new FormData();
      formData.append("file", item.file);
      formData.append("title", item.title);
      formData.append("description", item.description);
      formData.append("categoryId", item.categoryId);
      formData.append("semester", item.semester);
      formData.append("course", item.course);
      formData.append("tags", JSON.stringify([]));

      const xhr = new XMLHttpRequest();
      
      // 进度跟踪
      let startTime = Date.now();
      let lastLoaded = 0;
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          
          // 计算上传速度
          const elapsed = (Date.now() - startTime) / 1000;
          const loadedSinceLast = event.loaded - lastLoaded;
          const speed = elapsed > 0 ? loadedSinceLast / elapsed : 0;
          lastLoaded = event.loaded;
          startTime = Date.now();
          
          let speedText = "";
          if (speed > 1024 * 1024) {
            speedText = `${(speed / 1024 / 1024).toFixed(1)} MB/s`;
          } else if (speed > 1024) {
            speedText = `${(speed / 1024).toFixed(1)} KB/s`;
          } else {
            speedText = `${speed.toFixed(0)} B/s`;
          }
          
          onProgress(progress, speedText);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({ success: true, compression: data.compression });
          } catch {
            reject(new Error("解析响应失败"));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error || `上传失败 (${xhr.status})`));
          } catch {
            reject(new Error(`上传失败 (${xhr.status})`));
          }
        }
      };

      xhr.onerror = () => reject(new Error("网络错误"));
      xhr.ontimeout = () => reject(new Error("上传超时"));

      xhr.open("POST", "/api/files/upload");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.timeout = 10 * 60 * 1000; // 10分钟超时
      xhr.send(formData);
    });
  };

  // 批量上传
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证所有文件
    const pendingItems = fileItems.filter(item => item.status === "pending" || item.status === "error");
    const invalidItems = pendingItems.filter(item => !item.title.trim() || !item.categoryId);
    
    if (invalidItems.length > 0) {
      toast.error(`有 ${invalidItems.length} 个文件未填写标题或未选择分类`);
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: pendingItems.length });
    
    let successCount = 0;
    let failCount = 0;
    let compressedCount = 0;
    let totalSaved = 0;
    const MAX_RETRY = 3; // 最大重试次数

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      setUploadProgress({ current: i + 1, total: pendingItems.length });
      updateFileItem(item.id, { status: "uploading", progress: 0, speed: "", retryCount: item.retryCount || 0 });
      
      // 带重试的上传
      let lastError: string = "";
      for (let retry = 0; retry <= MAX_RETRY; retry++) {
        try {
          if (retry > 0) {
            updateFileItem(item.id, { retryCount: retry });
            toast.info(`正在重试上传 ${item.file.name} (${retry}/${MAX_RETRY})`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retry)); // 指数退避
          }

          const result = await uploadSingleFile(item, (progress, speed) => {
            updateFileItem(item.id, { progress, speed });
          });
          
          updateFileItem(item.id, { status: "success", progress: 100 });
          successCount++;
          
          if (result.compression) {
            compressedCount++;
            const saved = result.compression.originalSize - result.compression.compressedSize;
            totalSaved += saved;
            toast.info(`${item.file.name} 已压缩 ${result.compression.ratio}`);
          }
          
          lastError = "";
          break; // 成功则跳出重试循环
        } catch (error) {
          lastError = error instanceof Error ? error.message : "上传失败";
          if (retry === MAX_RETRY) {
            updateFileItem(item.id, { status: "error", error: lastError });
            failCount++;
          }
        }
      }
    }

    setUploading(false);

    if (successCount > 0 && failCount === 0) {
      const compressionMsg = compressedCount > 0 
        ? `，${compressedCount} 个PDF已压缩（节省 ${(totalSaved / 1024 / 1024).toFixed(1)}MB）` 
        : "";
      const reviewMsg = !isAdminOrVolunteer 
        ? "。您的资料已提交，等待管理员审核后上架" 
        : "";
      toast.success(`成功上传 ${successCount} 个文件${compressionMsg}${reviewMsg}`);
      onOpenChange(false);
      onSuccess();
    } else if (successCount > 0 && failCount > 0) {
      const reviewMsg = !isAdminOrVolunteer 
        ? "。审核通过后将自动上架" 
        : "";
      toast.warning(`上传完成：${successCount} 个成功，${failCount} 个失败${reviewMsg}`);
    } else {
      toast.error("所有文件上传失败");
    }
  };

  const pendingItems = fileItems.filter(item => item.status === "pending" || item.status === "error");
  const successCount = fileItems.filter(item => item.status === "success").length;
  const errorCount = fileItems.filter(item => item.status === "error").length;
  const hasPendingFiles = pendingItems.length > 0;
  const allSuccess = fileItems.length > 0 && fileItems.every(item => item.status === "success");

  // 统计未设置分类的文件数
  const noCategoryCount = useMemo(() => {
    return fileItems.filter(item => item.status === "pending" && !item.categoryId).length;
  }, [fileItems]);

  // 获取文件类型颜色
  const getTypeColor = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    const colors: Record<string, string> = {
      pdf: "#EF4444",
      doc: "#3B82F6",
      docx: "#3B82F6",
      ppt: "#F97316",
      pptx: "#F97316",
      xls: "#22C55E",
      xlsx: "#22C55E",
      zip: "#8B5CF6",
      rar: "#8B5CF6",
    };
    return colors[ext || ""] || "#005BA3";
  };

  // 格式化文件大小统计
  const totalSize = useMemo(() => {
    const bytes = fileItems.reduce((sum, item) => sum + item.file.size, 0);
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }, [fileItems]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col bg-white border-[#E2E8F0] rounded-2xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-semibold text-[#1E293B]">
            批量上传资料
          </DialogTitle>
          <DialogDescription className="text-[#64748B]">
            支持最多上传 {MAX_FILES} 个文件，单个文件最大 100MB。大文件自动使用分块上传，失败自动重试3次。
            {!isAdminOrVolunteer && (
              <span className="block mt-1 text-amber-600 text-sm">
                ⚠️ 您上传的资料需要管理员审核后才能上架。
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden mt-4">
          {/* File Upload Area */}
          <div
            className={`flex-shrink-0 border-2 border-dashed rounded-xl p-6 text-center transition-all ${
              dragActive 
                ? "border-[#005BA3] bg-[#F0F7FF]" 
                : fileItems.length >= MAX_FILES
                  ? "border-[#E2E8F0] bg-[#F8FAFC] opacity-50"
                  : "border-[#E2E8F0] hover:border-[#94A3B8]"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="w-12 h-12 rounded-full bg-[#F1F5F9] flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6 text-[#005BA3]" />
            </div>
            <p className="text-sm text-[#475569] mb-1">拖拽文件到此处，或点击选择</p>
            <p className="text-xs text-[#94A3B8] mb-3">
              已选择 {fileItems.length}/{MAX_FILES} 个文件 · 总大小 {totalSize}
            </p>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={fileItems.length >= MAX_FILES}
              className="text-sm text-[#005BA3] font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              选择文件
            </button>
          </div>

          {/* 批量操作栏 */}
          {fileItems.length > 1 && hasPendingFiles && (
            <div className="flex-shrink-0 mt-4 p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="w-4 h-4 text-[#64748B]" />
                <span className="text-sm font-medium text-[#475569]">批量操作</span>
                <span className="text-xs text-[#94A3B8] ml-auto">
                  {noCategoryCount > 0 && `还有 ${noCategoryCount} 个文件未选择分类`}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* 批量分类 */}
                <div className="flex gap-1">
                  <Select value={batchCategory} onValueChange={setBatchCategory}>
                    <SelectTrigger className="neu-input text-sm py-1.5 border-0 h-auto flex-1 min-w-0">
                      <SelectValue placeholder="批量设置分类" />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={applyBatchCategory}
                    disabled={!batchCategory}
                    className="px-2 py-1 text-xs bg-[#005BA3] text-white rounded hover:bg-[#004080] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    应用
                  </button>
                </div>
                
                {/* 批量学期 */}
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={batchSemester}
                    onChange={(e) => setBatchSemester(e.target.value)}
                    placeholder="批量设置学期"
                    className="neu-input text-sm py-1.5 flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={applyBatchSemester}
                    disabled={!batchSemester.trim()}
                    className="px-2 py-1 text-xs bg-[#005BA3] text-white rounded hover:bg-[#004080] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    应用
                  </button>
                </div>
                
                {/* 批量课程 */}
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={batchCourse}
                    onChange={(e) => setBatchCourse(e.target.value)}
                    placeholder="批量设置课程"
                    className="neu-input text-sm py-1.5 flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={applyBatchCourse}
                    disabled={!batchCourse.trim()}
                    className="px-2 py-1 text-xs bg-[#005BA3] text-white rounded hover:bg-[#004080] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    应用
                  </button>
                </div>
                
                {/* 展开/收起 */}
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={toggleAllExpanded}
                    className="flex-1 px-2 py-1.5 text-xs border border-[#E2E8F0] rounded hover:bg-[#F1F5F9] flex items-center justify-center gap-1"
                  >
                    {allExpanded ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        全部收起
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        全部展开
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={clearAllFiles}
                    className="px-2 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"
                  >
                    清空
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 文件列表 */}
          {fileItems.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0 mt-4">
              <div className="flex items-center justify-between flex-shrink-0 mb-2">
                <Label className="text-sm font-medium text-[#475569]">
                  文件列表 ({fileItems.length})
                </Label>
                <div className="flex items-center gap-3 text-xs text-[#64748B]">
                  {successCount > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      成功 {successCount}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1 text-red-500">
                      <AlertCircle className="w-3 h-3" />
                      失败 {errorCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-0" style={{ maxHeight: "calc(90vh - 420px)" }}>
                {fileItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-lg border transition-all ${
                      item.status === "success" 
                        ? "bg-[#F0FDF4] border-[#BBF7D0]"
                        : item.status === "error"
                          ? "bg-[#FEF2F2] border-[#FECACA]"
                          : item.status === "uploading"
                            ? "bg-[#F0F7FF] border-[#BAE6FD]"
                            : "bg-white border-[#E2E8F0]"
                    }`}
                  >
                    {/* 文件信息行 - 始终显示 */}
                    <div className="flex items-center gap-3 p-3">
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: getTypeColor(item.file.name) }}
                      >
                        {item.status === "uploading" ? (
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        ) : item.status === "success" ? (
                          <CheckCircle className="w-5 h-5 text-white" />
                        ) : item.status === "error" ? (
                          <AlertCircle className="w-5 h-5 text-white" />
                        ) : (
                          <FileText className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-[#1E293B] block truncate">
                          {item.file.name}
                        </span>
                        <span className="text-xs text-[#64748B]">
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                          {item.categoryId && (
                            <span className="ml-2 text-[#005BA3]">
                              · {categories.find(c => c.id === item.categoryId)?.name || "已分类"}
                            </span>
                          )}
                        </span>
                      </div>
                      
                      {item.status === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            className="p-1.5 hover:bg-[#F1F5F9] rounded transition-colors text-[#64748B] hover:text-[#1E293B]"
                            title={item.expanded ? "收起" : "展开更多选项"}
                          >
                            {item.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFileItem(item.id)}
                            className="p-1.5 hover:bg-[#FEE2E2] rounded transition-colors text-[#64748B] hover:text-red-500"
                            title="移除文件"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                    
                    {/* 错误信息 */}
                    {item.status === "error" && item.error && (
                      <div className="px-3 pb-3 text-xs text-red-600">{item.error}</div>
                    )}
                    
                    {/* 上传进度 */}
                    {item.status === "uploading" && (
                      <div className="px-3 pb-3 pt-1 border-t border-[#E2E8F0]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#64748B]">
                            {item.retryCount && item.retryCount > 0 
                              ? `重试中 (${item.retryCount}/3)...` 
                              : item.file.size > LARGE_FILE_THRESHOLD 
                                ? "分块上传中..." 
                                : "上传中..."}
                          </span>
                          <span className="text-xs text-[#005BA3] font-medium">{item.progress || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-[#005BA3] h-2 rounded-full transition-all duration-300"
                            style={{ width: `${item.progress || 0}%` }}
                          />
                        </div>
                        {item.speed && (
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-[#94A3B8]">{item.speed}</span>
                            <span className="text-xs text-[#94A3B8]">
                              {(item.file.size / 1024 / 1024).toFixed(1)} MB
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 基础编辑区域 - 始终显示（pending状态） */}
                    {item.status === "pending" && (
                      <div className="px-3 pb-3 pt-1 border-t border-[#E2E8F0]">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => updateFileItem(item.id, { title: e.target.value })}
                            placeholder="标题 *"
                            className="neu-input text-sm py-1.5"
                          />
                          <Select 
                            value={item.categoryId} 
                            onValueChange={(value) => updateFileItem(item.id, { categoryId: value })}
                          >
                            <SelectTrigger className={`neu-input text-sm py-1.5 border-0 h-auto ${!item.categoryId ? 'text-[#94A3B8]' : ''}`}>
                              <SelectValue placeholder="选择分类 *" />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              {categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    
                    {/* 详细编辑区域 - 展开时显示 */}
                    {item.status === "pending" && item.expanded && (
                      <div className="px-3 pb-3 pt-2 border-t border-[#E2E8F0] space-y-2">
                        <div>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateFileItem(item.id, { description: e.target.value })}
                            placeholder="描述（可选）"
                            className="neu-input text-sm py-1.5 w-full"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={item.semester}
                            onChange={(e) => updateFileItem(item.id, { semester: e.target.value })}
                            placeholder="学期，如：2024-Fall"
                            className="neu-input text-sm py-1.5"
                          />
                          <input
                            type="text"
                            value={item.course}
                            onChange={(e) => updateFileItem(item.id, { course: e.target.value })}
                            placeholder="课程名称"
                            className="neu-input text-sm py-1.5"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 flex-shrink-0 sticky bottom-0 bg-white border-t border-[#E2E8F0] mt-4 -mx-6 px-6 pb-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="glass-button"
              disabled={uploading}
            >
              {allSuccess ? "完成" : "取消"}
            </button>
            {hasPendingFiles && (
              <button
                type="submit"
                disabled={uploading}
                className="neu-button-primary disabled:opacity-50"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    上传中 ({uploadProgress.current}/{uploadProgress.total})
                  </span>
                ) : (
                  `上传 ${pendingItems.length} 个文件`
                )}
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
