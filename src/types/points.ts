export interface UserPoints {
  id: string;
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  created_at: string;
  updated_at?: string;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'upload' | 'publish' | 'download' | 'weekly_top' | 'featured' | 'admin_adjust' | 'register_bonus';
  description?: string;
  related_file_id?: string;
  created_at: string;
}

export interface FeaturedFile {
  id: string;
  file_id: string;
  featured_by: string;
  created_at: string;
}

// 积分配置
export const POINTS_CONFIG = {
  UPLOAD_REWARD: 10,        // 文件上架奖励
  DOWNLOAD_COST: 5,         // 下载文件消耗
  WEEKLY_TOP_REWARD: 50,    // 周下载排名前5奖励
  FEATURED_REWARD: 30,      // 被精选奖励
  REGISTER_BONUS: 20,       // 注册奖励
} as const;
