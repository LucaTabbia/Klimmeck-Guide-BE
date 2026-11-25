// porta verso l'archivio delle immagini: Cloudinary nell'app, un fake nei test (Phase 26)
export abstract class PortraitStore {
    // il cloud su cui agisce destroy: un ritratto di un altro cloud non è suo (CR-01); null = non configurato
    abstract readonly cloudName: string | null;

    // risolve anche per un asset già assente; lancia per un errore del provider
    abstract destroy(publicId: string): Promise<void>;
}
