export interface User {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  name: string;
  real_name: string;
  student_id: string;
  phone?: string;
  school?: string;
  is_verified: boolean;
  role: "admin" | "volunteer" | "guest";
  avatar?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  parent_id?: string;
  order: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  file_count?: number;
}

export interface File {
  id: string;
  title: string;
  description?: string;
  file_name: string;
  file_key: string;
  file_size: number;
  file_type: string;
  mime_type: string;
  category_id: string;
  uploader_id: string;
  download_count: number;
  average_rating: string;
  rating_count: number;
  comment_count?: number;
  tags: string[];
  semester?: string;
  course?: string;
  is_active: boolean;
  is_featured?: boolean;
  ai_classified_at?: string;
  preview_url?: string;
  created_at: string;
  updated_at?: string;
  profiles?: {
    name: string;
    email?: string;
    avatar?: string;
    real_name?: string;
    student_id?: string;
  };
  categories?: {
    name: string;
  };
}

export interface Rating {
  id: string;
  file_id: string;
  user_id: string;
  score: number;
  created_at: string;
  updated_at?: string;
  profiles?: {
    name: string;
    avatar?: string;
  };
}

export interface Comment {
  id: string;
  file_id: string;
  user_id: string;
  content: string;
  parent_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  profiles?: {
    name: string;
    avatar?: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
