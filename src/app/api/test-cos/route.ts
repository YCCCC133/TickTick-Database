import { NextResponse } from "next/server";
import COS from "cos-nodejs-sdk-v5";

// 测试腾讯云COS连接
export async function GET() {
  const results: {
    step: string;
    status: "success" | "error";
    message: string;
    data?: Record<string, unknown>;
  }[] = [];

  try {
    // Step 1: 检查环境变量
    const secretId = process.env.COS_SECRET_ID || process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.COS_SECRET_KEY || process.env.TENCENT_SECRET_KEY;
    const bucket = process.env.COS_BUCKET_NAME || "ycccc-1333091364";
    const region = process.env.COS_REGION || "ap-beijing";

    if (!secretId || !secretKey) {
      results.push({
        step: "环境变量检查",
        status: "error",
        message: "缺少COS密钥配置",
      });
      return NextResponse.json({ results, success: false });
    }

    results.push({
      step: "环境变量检查",
      status: "success",
      message: "所有必需的环境变量已配置",
      data: {
        secretId: secretId.substring(0, 8) + "***",
        bucket,
        region,
      },
    });

    // Step 2: 初始化COS客户端
    const cos = new COS({
      SecretId: secretId,
      SecretKey: secretKey,
    });

    results.push({
      step: "COS客户端初始化",
      status: "success",
      message: "客户端创建成功",
    });

    // Step 3: 测试获取存储桶列表 (验证密钥有效性)
    const serviceResult = await new Promise<{ success: boolean; data?: unknown; error?: string }>(
      (resolve) => {
        cos.getService((err, data) => {
          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, data });
          }
        });
      }
    );

    if (!serviceResult.success) {
      results.push({
        step: "验证密钥有效性",
        status: "error",
        message: `密钥验证失败: ${serviceResult.error}`,
      });
      return NextResponse.json({ results, success: false });
    }

    const buckets = (serviceResult.data as { Buckets?: { Bucket: { Name: string; Location: string }[] } }).Buckets?.Bucket || [];
    const targetBucket = buckets.find((b) => b.Name === bucket);

    results.push({
      step: "验证密钥有效性",
      status: "success",
      message: `找到 ${buckets.length} 个存储桶`,
      data: {
        buckets: buckets.map((b) => ({ name: b.Name, location: b.Location })),
        targetBucketFound: !!targetBucket,
      },
    });

    // Step 4: 测试访问目标存储桶
    const bucketResult = await new Promise<{ success: boolean; data?: unknown; error?: string }>(
      (resolve) => {
        cos.getBucket(
          {
            Bucket: bucket,
            Region: region,
            MaxKeys: 5,
          },
          (err, data) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true, data });
            }
          }
        );
      }
    );

    if (!bucketResult.success) {
      results.push({
        step: "访问目标存储桶",
        status: "error",
        message: `访问失败: ${bucketResult.error}`,
      });
      return NextResponse.json({ results, success: false });
    }

    const bucketData = bucketResult.data as { Name?: string; Contents?: { Key: string; Size: number }[] };
    results.push({
      step: "访问目标存储桶",
      status: "success",
      message: `成功访问存储桶: ${bucketData.Name}`,
      data: {
        bucketName: bucketData.Name,
        objectCount: bucketData.Contents?.length || 0,
        sampleObjects: bucketData.Contents?.slice(0, 3).map((obj) => ({
          key: obj.Key,
          size: obj.Size,
        })),
      },
    });

    // Step 5: 测试上传功能
    const testKey = `test/connection-test-${Date.now()}.txt`;
    const testContent = Buffer.from(`COS连接测试 - ${new Date().toISOString()}`);

    const uploadResult = await new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        cos.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: testKey,
            Body: testContent,
            ContentType: "text/plain",
          },
          (err) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      }
    );

    if (!uploadResult.success) {
      results.push({
        step: "测试上传功能",
        status: "error",
        message: `上传失败: ${uploadResult.error}`,
      });
      return NextResponse.json({ results, success: false });
    }

    results.push({
      step: "测试上传功能",
      status: "success",
      message: `测试文件上传成功: ${testKey}`,
    });

    // Step 6: 测试获取预签名URL
    const urlResult = await new Promise<{ success: boolean; url?: string; error?: string }>(
      (resolve) => {
        cos.getObjectUrl(
          {
            Bucket: bucket,
            Region: region,
            Key: testKey,
            Sign: true,
            Expires: 3600,
          },
          (err, data) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true, url: data.Url });
            }
          }
        );
      }
    );

    if (!urlResult.success) {
      results.push({
        step: "测试预签名URL",
        status: "error",
        message: `URL生成失败: ${urlResult.error}`,
      });
    } else {
      results.push({
        step: "测试预签名URL",
        status: "success",
        message: "预签名URL生成成功",
        data: { urlLength: urlResult.url?.length },
      });
    }

    // Step 7: 清理测试文件
    const deleteResult = await new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        cos.deleteObject(
          {
            Bucket: bucket,
            Region: region,
            Key: testKey,
          },
          (err) => {
            if (err) {
              resolve({ success: false, error: err.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      }
    );

    results.push({
      step: "清理测试文件",
      status: deleteResult.success ? "success" : "error",
      message: deleteResult.success ? "测试文件已删除" : `删除失败: ${deleteResult.error}`,
    });

    // 最终结果
    const allSuccess = results.every((r) => r.status === "success");
    return NextResponse.json({
      results,
      success: allSuccess,
      message: allSuccess ? "腾讯云COS连接正常，所有测试通过！" : "部分测试失败",
      config: {
        bucket,
        region,
        secretIdPrefix: secretId.substring(0, 8) + "***",
      },
    });
  } catch (error) {
    return NextResponse.json({
      results,
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    });
  }
}
