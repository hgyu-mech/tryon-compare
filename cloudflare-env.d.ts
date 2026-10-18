declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    JUDGE_PASSWORD?: string;
    YOUCAM_API_KEY?: string;
    YOUCAM_ENABLE_UPLOAD?: string;
    SERVER_UNIT_LIMIT?: string;
  }
}
