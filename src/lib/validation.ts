import { z } from 'zod';

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PHOTOS = 3;

export const createIssueSchema = z.object({
  room_id: z.string().min(2, 'Please select a valid room or location'),
  category: z.enum([
    'Lights',
    'Fans',
    'Projectors',
    'Wi-Fi',
    'AC',
    'Plumbing/Washroom',
    'Furniture',
    'Electrical',
    'Cleanliness',
    'Equipment',
    'Other',
  ]),
  urgency: z.enum(['low', 'medium', 'urgent']),
  title: z
    .string()
    .trim()
    .min(5, 'Summary must be at least 5 characters')
    .max(120, 'Summary cannot exceed 120 characters'),
  description: z
    .string()
    .trim()
    .min(10, 'Please describe the issue in at least 10 characters')
    .max(1500, 'Description cannot exceed 1500 characters'),
  photo_urls: z
    .array(
      z
        .string()
        .refine(
          (val) =>
            /^\/api\/uploads\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(val) ||
            /^https:\/\/.+/.test(val),
          'Invalid photo attachment path',
        ),
    )
    .max(MAX_PHOTOS)
    .optional(),
  idempotency_key: z.string().min(8),
});

export const ticketLookupSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CC-\d{3,6}$/, 'Enter a valid ticket ID such as CC-2048');

export const studentSignInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const studentSignUpSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(80),
  enrollment_no: z
    .string()
    .trim()
    .min(4, 'Enter your MITS enrollment number (e.g. 0901CS231045)')
    .max(24),
  email: z.string().trim().email('Enter a valid college or personal email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const adminClaimSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter staff full name').max(80),
  email: z.string().trim().email('Enter a valid staff email address'),
  password: z.string().min(8, 'Admin password must be at least 8 characters'),
});

export const updateStatusSchema = z.object({
  status: z.enum(['reported', 'acknowledged', 'assigned', 'in_progress', 'resolved']),
  note: z.string().trim().max(300).optional(),
});

export const assignTechnicianSchema = z.object({
  technicianId: z.string().trim().min(1).nullable(),
});

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return `${file.name}: Only JPEG, PNG, or WebP images are allowed.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${file.name}: File exceeds the 5 MB limit.`;
  }
  return null;
}

export async function compressIssueImage(file: File): Promise<File> {
  if (file.size <= 350 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const cleanName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          resolve(new File([blob], cleanName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.82,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
