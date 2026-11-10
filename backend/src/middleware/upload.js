import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mediaRoot = path.resolve(__dirname, '../../media');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder = 'uploads';
    if (file.fieldname === 'resume' || file.fieldname === 'cv' || file.fieldname === 'file') {
      subfolder = 'student_cvs';
    } else if (file.fieldname === 'srs_document') {
      subfolder = 'srs_docs';
    } else if (file.fieldname === 'profile_photo') {
      subfolder = 'profile_photos';
    }
    const dest = path.join(mediaRoot, subfolder);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const randomHash = Math.random().toString(36).substring(2, 9);
    cb(null, `${basename}_${randomHash}${ext}`);
  }
});

const ALLOWED_DOC_EXTS = new Set(['.pdf', '.docx', '.doc']);
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  // Block dangerous executable/script extensions
  const dangerousExts = ['.html', '.htm', '.xhtml', '.svg', '.xml', '.exe', '.sh', '.bat', '.js', '.mjs', '.php', '.phtml', '.py'];
  if (dangerousExts.includes(ext)) {
    return cb(new Error(`File type ${ext} is not permitted for security reasons.`));
  }

  if (file.fieldname === 'profile_photo') {
    if (ALLOWED_IMAGE_EXTS.has(ext) && (ALLOWED_IMAGE_MIMES.has(mime) || !mime)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid profile photo format. Allowed formats: JPG, JPEG, PNG, WEBP.'));
  }

  if (file.fieldname === 'resume' || file.fieldname === 'cv' || file.fieldname === 'file' || file.fieldname === 'srs_document') {
    if (ALLOWED_DOC_EXTS.has(ext)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid document format. Allowed formats: PDF (.pdf), Word (.docx).'));
  }

  if (ALLOWED_DOC_EXTS.has(ext) || ALLOWED_IMAGE_EXTS.has(ext)) {
    return cb(null, true);
  }

  return cb(new Error(`Unsupported file format (${ext}). Only standard documents and images are permitted.`));
};

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter,
});
