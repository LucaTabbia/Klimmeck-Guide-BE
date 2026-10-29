// il picker del FE ridimensiona a ≤ 1024 px (qualità 85): 5 MiB lascia ampio margine (D-01)
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_UPLOAD_LIMITS = {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
} as const;
