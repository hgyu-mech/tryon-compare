import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

const BASE = 'https://yce-api-01.makeupar.com';
const STORAGE_HOSTS = new Set(['yce-us.s3-accelerate.amazonaws.com', 'yce-us.s3.amazonaws.com']);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // Conservative starter limit below the provider's 10 MB.

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const invalid = message => new AppError(400, 'invalid_input', message);

// Header parsing is a boundary check, not a full image decoder or content moderation.
export function imageDimensions(bytes, mime) {
  if (mime === 'image/png') {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw invalid('The PNG header is invalid.');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw invalid('The JPEG header is invalid.');
  let offset = 2;
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw invalid('The JPEG marker is invalid.');
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw invalid('The JPEG segment is truncated.');
    if (sof.has(marker)) {
      if (length < 8) throw invalid('The JPEG size header is invalid.');
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw invalid('The JPEG dimensions could not be read.');
}

export function decodeImage(raw) {
  if (!raw || typeof raw !== 'object' || !['image/jpeg', 'image/png'].includes(raw.mime)) throw invalid('Choose a JPEG or PNG image.');
  if (typeof raw.base64 !== 'string' || raw.base64.length === 0 || raw.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.base64)) throw invalid('The image encoding is invalid or too large.');
  const bytes = Buffer.from(raw.base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw invalid('Each image must be at most 8 MiB.');
  const dimensions = imageDimensions(bytes, raw.mime);
  if (Math.min(dimensions.width, dimensions.height) < 384 || Math.max(dimensions.width, dimensions.height) < 512 || Math.max(dimensions.width, dimensions.height) > 4096) throw invalid('Use an image at least 512 × 384 pixels, with no side above 4096 pixels.');
  return { bytes, mime: raw.mime, ...dimensions };
}

export function validateTryOn(raw) {
  if (!raw || typeof raw !== 'object' || raw.consent !== true) throw invalid('Confirm your rights and consent before sending photos.');
  if (!['upper_body', 'outer', 'full_body', 'lower_body', 'shoes', 'auto'].includes(raw.category)) throw invalid('Choose a supported garment category.');
  return { source: decodeImage(raw.source), garment: decodeImage(raw.garment), category: raw.category };
}

export function safeStorageUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new AppError(502, 'provider_schema', 'The provider returned an invalid image URL.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !STORAGE_HOSTS.has(url.hostname)) throw new AppError(502, 'provider_schema', 'The provider storage host is not supported by this starter.');
  return url.href;
}

export function createYouCamClient({ apiKey, fetchImpl = fetch }) {
  async function request(path, method = 'GET', body) {
    let response;
    try {
      response = await fetchImpl(`${BASE}${path}`, {
        // Workers support manual/follow. Reject non-2xx below without following
        // redirects, so credentials are never forwarded to another origin.
        method, redirect: 'manual', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new AppError(502, 'provider_unavailable', 'The provider request did not finish. Check the console before retrying; no task is retried automatically.');
    }
    if (!response.ok) throw new AppError(502, 'provider_rejected', `The provider rejected the request (HTTP ${response.status}). Check credentials and units in your private console.`);
    let result;
    try { result = await response.json(); } catch { throw new AppError(502, 'provider_schema', 'The provider returned an unreadable response.'); }
    if (result.status !== undefined && result.status !== 200) throw new AppError(502, 'provider_rejected', 'The provider returned an unsuccessful response.');
    return result;
  }

  async function upload(image) {
    const contentType = image.mime === 'image/jpeg' ? 'image/jpg' : image.mime;
    const fileName = `${randomUUID()}.${image.mime === 'image/jpeg' ? 'jpg' : 'png'}`;
    const response = await request('/s2s/v2.0/file', 'POST', { files: [{ content_type: contentType, file_name: fileName, file_size: image.bytes.length }] });
    // The prose guide nests files under data; the downloadable File schema also exposes a root files shape.
    const file = (response.data?.files ?? response.files)?.[0];
    const uploadRequest = file?.requests?.[0];
    if (typeof file?.file_id !== 'string' || file.file_id.length > 1024 || !file.file_id || uploadRequest?.method !== 'PUT' || file.requests.length !== 1) throw new AppError(502, 'provider_schema', 'The provider upload response is not supported.');
    const url = safeStorageUrl(uploadRequest.url);
    const suppliedType = uploadRequest.headers?.['Content-Type'] ?? uploadRequest.headers?.['content-type'];
    const suppliedLength = uploadRequest.headers?.['Content-Length'] ?? uploadRequest.headers?.['content-length'];
    if (suppliedType !== contentType || Number(suppliedLength) !== image.bytes.length || Object.keys(uploadRequest.headers ?? {}).some(key => !['content-type', 'content-length'].includes(key.toLowerCase()))) throw new AppError(502, 'provider_schema', 'The provider upload headers require an adapter review.');
    let responseUpload;
    try {
      responseUpload = await fetchImpl(url, { method: 'PUT', redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': contentType, 'Content-Length': String(image.bytes.length) }, body: image.bytes });
    } catch { throw new AppError(502, 'upload_failed', 'The photo upload did not finish. No AI task was retried automatically.'); }
    if (!responseUpload.ok) throw new AppError(502, 'upload_failed', 'The photo upload was rejected.');
    return file.file_id;
  }

  return {
    async start(input) {
      const sourceId = await upload(input.source);
      const garmentId = await upload(input.garment);
      const response = await request('/s2s/v2.0/task/cloth-v4', 'POST', { src_file_id: sourceId, ref_file_id: garmentId, garment_category: input.category, change_shoes: false, filter_multi_person: 'strict' });
      if (typeof response.data?.task_id !== 'string' || !response.data.task_id || response.data.task_id.length > 1024) throw new AppError(502, 'provider_schema', 'The provider task ID could not be read. Check the console before retrying.');
      return response.data.task_id;
    },
    async status(taskId) {
      const response = await request(`/s2s/v2.0/task/cloth-v4/${encodeURIComponent(taskId)}`);
      const data = response.data;
      if (!['running', 'success', 'error'].includes(data?.task_status)) throw new AppError(502, 'provider_schema', 'The provider task status is not supported.');
      if (data.task_status === 'success') return { status: 'success', imageUrl: safeStorageUrl(data.results?.url) };
      if (data.task_status === 'error') return { status: 'error', message: 'The provider could not process these photos. Check pose, category and image suitability before another attempt.' };
      return { status: 'running' };
    }
  };
}
