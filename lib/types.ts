export type ShareRole = "viewer" | "editor";

export type User = {
  id: string;
  username: string;
  created_at: string;
};

export type SessionUser = {
  id: string;
  username: string;
};

export type DocumentRow = {
  id: string;
  title: string;
  owner_id: string;
  content_json: unknown;
  yjs_state: string | null;
  share_token: string | null;
  share_role: ShareRole | null;
  created_at: string;
  updated_at: string;
};

export type DocumentListItem = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  badge: "owned" | "shared";
  role: "owner" | ShareRole;
  owner_username?: string;
};

export type AttachmentRow = {
  id: string;
  document_id: string;
  filename: string;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
};

export type AccessLevel = "owner" | "editor" | "viewer" | null;

export const CONTENT_IMPORT_TYPES = [".txt", ".md", ".docx"] as const;
export const ATTACHMENT_IMAGE_TYPES = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;
export const ATTACHMENT_FILE_TYPES = [".pdf"] as const;

export const CONTENT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const ATTACHMENT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
