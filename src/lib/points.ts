import { getSupabaseClient } from "@/storage/database/supabase-client";
import { POINTS_CONFIG } from "@/types/points";

type TransactionType = 'upload' | 'publish' | 'download' | 'weekly_top' | 'featured' | 'admin_adjust' | 'register_bonus';

interface TransactionParams {
  userId: string;
  amount: number;
  type: TransactionType;
  description?: string;
  relatedFileId?: string;
}

/**
 * 执行积分交易
 * 使用 Supabase 客户端直接操作
 */
export async function executePointsTransaction(params: TransactionParams): Promise<{ success: boolean; error?: string }> {
  const { userId, amount, type, description, relatedFileId } = params;
  
  try {
    const client = getSupabaseClient();

    // 1. 获取当前积分
    const { data: currentPoints, error: fetchError } = await client
      .from("user_points")
      .select("balance, total_earned, total_spent")
      .eq("user_id", userId)
      .single();

    if (fetchError) {
      // 如果没有积分记录，创建一个
      if (fetchError.code === "PGRST116") {
        const initialBalance = POINTS_CONFIG.REGISTER_BONUS + (amount > 0 ? amount : 0);
        
        const { error: createError } = await client
          .from("user_points")
          .insert({
            user_id: userId,
            balance: initialBalance,
            total_earned: POINTS_CONFIG.REGISTER_BONUS + (amount > 0 ? amount : 0),
            total_spent: amount < 0 ? Math.abs(amount) : 0,
          });

        if (createError) {
          return { success: false, error: createError.message };
        }
      } else {
        return { success: false, error: fetchError.message };
      }
    } else {
      // 2. 检查余额是否足够（如果是扣减）
      if (amount < 0 && currentPoints.balance + amount < 0) {
        return { success: false, error: "积分不足" };
      }

      // 3. 更新积分
      const newBalance = currentPoints.balance + amount;
      const newTotalEarned = amount > 0 ? currentPoints.total_earned + amount : currentPoints.total_earned;
      const newTotalSpent = amount < 0 ? currentPoints.total_spent + Math.abs(amount) : currentPoints.total_spent;

      const { error: updateError } = await client
        .from("user_points")
        .update({
          balance: newBalance,
          total_earned: newTotalEarned,
          total_spent: newTotalSpent,
        })
        .eq("user_id", userId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    // 4. 记录交易
    const { error: transactionError } = await client
      .from("point_transactions")
      .insert({
        user_id: userId,
        amount,
        type,
        description,
        related_file_id: relatedFileId,
      });

    if (transactionError) {
      console.error("Failed to record transaction:", transactionError);
      // 不返回错误，因为积分已经更新
    }

    return { success: true };
  } catch (error) {
    console.error("Points transaction error:", error);
    return { success: false, error: "积分交易失败" };
  }
}

/**
 * 获取用户积分余额
 */
export async function getUserPointsBalance(userId: string): Promise<number> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("user_points")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (error) {
      // 表不存在或其他错误，返回默认值
      console.error("Failed to get user points:", error.message);
      return POINTS_CONFIG.REGISTER_BONUS;
    }

    return data?.balance ?? POINTS_CONFIG.REGISTER_BONUS;
  } catch (error) {
    console.error("Get user points balance error:", error);
    return POINTS_CONFIG.REGISTER_BONUS;
  }
}

async function hasExistingPublishReward(userId: string, fileId: string): Promise<boolean> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("point_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("related_file_id", fileId)
    .eq("type", "publish")
    .limit(1);

  if (error) {
    console.warn("Failed to check existing publish reward:", error.message);
    return false;
  }

  return (data?.length || 0) > 0;
}

/**
 * 奖励文件上架积分
 */
export async function rewardPublishPoints(userId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
  if (await hasExistingPublishReward(userId, fileId)) {
    return { success: true };
  }

  return executePointsTransaction({
    userId,
    amount: POINTS_CONFIG.UPLOAD_REWARD,
    type: "publish",
    description: "资料上架奖励",
    relatedFileId: fileId,
  });
}

/**
 * @deprecated 兼容旧调用。实际语义已改为“上架奖励”。
 */
export async function rewardUploadPoints(userId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
  return rewardPublishPoints(userId, fileId);
}

/**
 * 扣除下载积分
 */
export async function deductDownloadPoints(userId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
  return executePointsTransaction({
    userId,
    amount: -POINTS_CONFIG.DOWNLOAD_COST,
    type: "download",
    description: "下载资料消耗",
    relatedFileId: fileId,
  });
}

/**
 * 奖励周排名积分
 */
export async function rewardWeeklyTopPoints(userId: string, fileId: string, rank: number): Promise<{ success: boolean; error?: string }> {
  return executePointsTransaction({
    userId,
    amount: POINTS_CONFIG.WEEKLY_TOP_REWARD,
    type: "weekly_top",
    description: `周下载排名第${rank}名奖励`,
    relatedFileId: fileId,
  });
}

/**
 * 奖励精选积分
 */
export async function rewardFeaturedPoints(userId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
  return executePointsTransaction({
    userId,
    amount: POINTS_CONFIG.FEATURED_REWARD,
    type: "featured",
    description: "资料被精选奖励",
    relatedFileId: fileId,
  });
}
