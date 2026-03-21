"use client";

export interface DirectUploadMetadata {
  title: string;
  description: string;
  categoryId: string;
  semester: string;
  course: string;
  tags: string[];
}

export function getStoredUploadToken(): string | null {
  if (typeof window === "undefined") return null;

  const localToken = localStorage.getItem("token");
  if (localToken) return localToken;

  const sessionJson = localStorage.getItem("auth_session");
  if (sessionJson) {
    try {
      const session = JSON.parse(sessionJson) as { access_token?: string };
      if (session.access_token) return session.access_token;
    } catch {
      // ignore malformed session payloads
    }
  }

  const cookieMatch = document.cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (cookieMatch?.[1]) {
    return decodeURIComponent(cookieMatch[1]);
  }

  return null;
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const json = JSON.parse(text);
      return json?.error || json?.message || fallback;
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return fallback;
  }
}

export async function uploadFileDirectToCos(
  file: File,
  metadata: DirectUploadMetadata,
  token: string,
  onProgress: (progress: number, speed: string) => void
): Promise<{ success: boolean }> {
  const initResponse = await fetch("/api/files/upload-direct", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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
    throw new Error(await readErrorMessage(initResponse, "初始化上传失败"));
  }

  const { uploadUrl, fileKey } = await initResponse.json();
  if (!uploadUrl || !fileKey) {
    throw new Error("初始化上传失败：缺少上传地址");
  }

  return new Promise<{ success: boolean }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let startTime = Date.now();
    let lastLoaded = 0;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;

      const progress = Math.round((event.loaded / event.total) * 100);
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
    };

    xhr.onload = async () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`COS 上传失败 (${xhr.status})`));
        return;
      }

      try {
        const completeResponse = await fetch("/api/files/upload-direct", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "x-upload-action": "complete",
          },
          body: JSON.stringify({
            fileKey,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || "application/octet-stream",
            title: metadata.title,
            description: metadata.description,
            categoryId: metadata.categoryId,
            semester: metadata.semester,
            course: metadata.course,
            tags: metadata.tags,
          }),
        });

        if (!completeResponse.ok) {
          reject(new Error(await readErrorMessage(completeResponse, "完成上传失败")));
          return;
        }

        onProgress(100, "");
        resolve({ success: true });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("完成上传失败"));
      }
    };

    xhr.onerror = () => reject(new Error("网络错误"));
    xhr.ontimeout = () => reject(new Error("上传超时"));

    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(file);
  });
}
