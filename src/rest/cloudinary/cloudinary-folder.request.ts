import { IsString, Matches, MaxLength, ValidateBy } from 'class-validator';
import { isListableFolder } from './portrait-folder';

// solo un prefisso di cartella Cloudinary: niente traversal né caratteri arbitrari verso l'API (D-01);
// mai la radice né la cartella dei ritratti caricati dai giocatori (Phase 26 U-01)
export class CloudinaryFolderRequest {
    @IsString()
    @MaxLength(200)
    @Matches(/^[A-Za-z0-9_/-]*$/)
    @ValidateBy({
        name: 'isListableFolder',
        validator: {
            validate: (value: unknown) =>
                typeof value === 'string' && isListableFolder(value),
        },
    })
    folder!: string;
}
