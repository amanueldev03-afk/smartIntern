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

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
