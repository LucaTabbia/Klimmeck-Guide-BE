// porta verso l'archivio delle immagini: Cloudinary nell'app, un fake nei test (Phase 26)
export abstract class PortraitStore {
    // risolve anche per un asset già assente; lancia per un errore del provider
    abstract destroy(publicId: string): Promise<void>;
}
