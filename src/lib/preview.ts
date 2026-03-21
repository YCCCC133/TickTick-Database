import { uploadFile, getFileUrl } from './storage';
import { ImageGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface GeneratePreviewOptions {
  title: string;
  fileType: string;
  category?: string;
  course?: string;
  fileId: string;
  fileKey: string;
  mimeType: string;
}

/**
 * 生成文件预览图并上传到腾讯云COS
 * 1. 图片文件：直接使用文件本身作为预览
 * 2. PDF文件：使用AI生成预览图
 * 3. 其他文件：使用AI生成预览图
 */
export async function generatePreviewImage(
  options: GeneratePreviewOptions,
  headers?: Record<string, string>
): Promise<string | null> {
  const { title, fileType, category, course, fileId, fileKey, mimeType } = options;

  try {
    // 图片文件直接使用文件本身作为预览
    if (isImageFile(mimeType, fileType)) {
      return await generateImagePreview(fileKey, fileId);
    }

    // PDF和其他文件使用AI生成预览图
    return await generateAIPreview(
      { title, fileType, category, course, fileId },
      headers
    );
  } catch (error) {
    console.error('Generate preview error:', error);
    return null;
  }
}

/**
 * 检查是否是图片文件
 */
function isImageFile(mimeType: string, fileType: string): boolean {
  const imageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  
  return imageMimeTypes.includes(mimeType.toLowerCase()) || 
         imageExtensions.includes(fileType.toLowerCase());
}

/**
 * 为图片文件生成预览（直接使用文件本身）
 */
async function generateImagePreview(fileKey: string, fileId: string): Promise<string | null> {
  try {
    // 生成访问URL（有效期30天）
    const imageUrl = await getFileUrl(fileKey, 30 * 24 * 3600);
    return imageUrl;
  } catch (error) {
    console.error('Generate image preview error:', error);
    return null;
  }
}

/**
 * 使用AI生成预览图
 */
async function generateAIPreview(
  options: Omit<GeneratePreviewOptions, 'fileKey' | 'mimeType'>,
  headers?: Record<string, string>
): Promise<string | null> {
  const { title, fileType, category, course, fileId } = options;

  try {
    const config = new Config();
    
    // 提取转发headers
    const customHeaders = headers 
      ? HeaderUtils.extractForwardHeaders(headers)
      : {};
    
    const client = new ImageGenerationClient(config, customHeaders);

    // 构建提示词 - 基于文件类型生成相关预览
    const prompt = buildPreviewPrompt(title, fileType, category, course);

    // 调用图片生成API
    const response = await client.generate({
      prompt,
      size: '1024x1024',
    });

    const helper = client.getResponseHelper(response);
    
    if (helper.success && helper.imageUrls[0]) {
      const imageUrl = helper.imageUrls[0];
      
      // 下载图片并上传到腾讯云COS
      const uploadedUrl = await downloadAndUploadToCOS(imageUrl, fileId);
      return uploadedUrl;
    } else {
      console.error('Preview generation failed:', helper.errorMessages);
      return null;
    }
  } catch (error) {
    console.error('Generate AI preview error:', error);
    return null;
  }
}

/**
 * 下载图片并上传到腾讯云COS
 */
async function downloadAndUploadToCOS(
  imageUrl: string,
  fileId: string
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `previews/${fileId}.png`;
    
    // 上传到腾讯云COS
    const uploadedKey = await uploadFile(buffer, filename, 'image/png');
    
    // 生成访问URL（有效期30天）
    const uploadedUrl = await getFileUrl(uploadedKey, 30 * 24 * 3600);
    
    return uploadedUrl;
  } catch (error) {
    console.error('Download and upload preview to COS error:', error);
    return null;
  }
}

/**
 * 构建预览图提示词
 */
function buildPreviewPrompt(
  title: string,
  fileType: string,
  category?: string,
  course?: string
): string {
  const typeColors: Record<string, string> = {
    pdf: 'red and white',
    doc: 'blue and white',
    docx: 'blue and white',
    ppt: 'orange and white',
    pptx: 'orange and white',
    xls: 'green and white',
    xlsx: 'green and white',
    zip: 'purple and white',
    rar: 'purple and white',
  };

  const colorTheme = typeColors[fileType.toLowerCase()] || 'blue and white';
  
  const prompts: string[] = [
    'minimalist document cover design',
    colorTheme,
    'clean geometric shapes',
    'professional academic style',
    'soft gradient background',
    'modern flat design',
    'high quality',
    'no text',
  ];

  if (course) {
    prompts.push('educational theme');
  }

  return prompts.join(', ');
}
