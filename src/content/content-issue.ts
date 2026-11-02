// file è relativo alla cartella content/ (es. 'lore/regni.yaml'): i report non espongono percorsi assoluti
export interface ContentIssue {
    file: string;
    line: number | null;
    entryId: string | null;
    path: string;
    message: string;
}
