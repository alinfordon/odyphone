# Fonturi locale pentru build offline

Layoutul folosește Outfit și Source Sans 3 din repository, prin `next/font/local`. Fișierele variabile complete păstrează diacriticele și intervalele de greutate folosite de interfață. Buildul nu necesită descărcări Google Fonts.

Sursa este repository-ul oficial Google Fonts, commitul `86aced91de05cd4f96a06838124cca45be337b2b`. Fiecare familie include licența SIL Open Font License 1.1 în fișierul OFL asociat.

| Fișier | Greutăți | SHA-256 |
| --- | --- | --- |
| Outfit-Variable.ttf | 100–900 | fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade |
| SourceSans3-Variable.ttf | 200–900 | 042fe2cc0b933e328410d7acbd0aa6a1873dca5aef81875f4bc214b08825c7b9 |

Fișierele provin din [Outfit](https://github.com/google/fonts/tree/86aced91de05cd4f96a06838124cca45be337b2b/ofl/outfit) și [Source Sans 3](https://github.com/google/fonts/tree/86aced91de05cd4f96a06838124cca45be337b2b/ofl/sourcesans3).

Verifică activele cu `node --test frontend/tests/offline-fonts.test.mjs`, din rădăcina repository-ului.
