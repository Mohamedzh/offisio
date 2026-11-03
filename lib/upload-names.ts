// Upload storage names: exactly what components/UploadForm.tsx requests
// (frame-<i>.jpg for up to 30 frames, source.<mp4|mov|webm>). Case-sensitive, so
// case variants and Windows device names (con, nul, ...) never match.
// Groups: 1 = slug, 2 = file name.
export const UPLOAD_FILE_RE = /^(frame-\d{1,2}\.jpg|source\.(?:mp4|mov|webm))$/;
export const UPLOAD_PATH_RE = /^uploads\/([A-Za-z0-9_-]{1,64})\/(frame-\d{1,2}\.jpg|source\.(?:mp4|mov|webm))$/;
