
# Klimmeck-Guide-BE
A Back End for a game type app, integrated with Telegram and Discord, to let players interact during live streams.


## Deploy

- Checklist di deploy (variabili obbligatorie in produzione, Redis, throttling, scan dei secret): `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §10.
- Migrazione dei riferimenti `Mixed` da eseguire prima e subito dopo il deploy: [`docs/runbooks/mixed-refs-migration.md`](./docs/runbooks/mixed-refs-migration.md).
- Variabili d'ambiente documentate riga per riga in [`.env.example`](./.env.example) (solo template, nessun valore reale).

## License

This project is distributed under a custom **proprietary license**.  
Use of the code is allowed only under specific conditions.  
See [LICENSE.txt](./LICENSE.txt) for full terms.

© 2025 Luca Tabbia (LordReavor). All rights reserved.