import { IsString, Matches, MaxLength } from 'class-validator';

// solo un prefisso di cartella Cloudinary: niente traversal né caratteri arbitrari verso l'API (D-01)
export class CloudinaryFolderRequest {
    @IsString()
    @MaxLength(200)
    @Matches(/^[A-Za-z0-9_/-]*$/)
    folder!: string;
}
