# Trading Paper Analyzer

Analyse locale des exports CSV de l’historique des soldes TradingView Paper Trading.

- Import des en-têtes français actuels (`Solde`, `P&L réalisé`), anciens (`Balance`, `Pertes et profits réalisés`) et anglais.
- Chaque import complète l’historique. Les opérations identiques sont ignorées en comparant date, soldes, résultat, devise et action ; les exécutions distinctes à la même seconde sont conservées.
- Les lignes sources sont sauvegardées dans le stockage local du navigateur (`trading-paper-history`, format versionné). Les trades et leurs dates sont reconstruits au rechargement, y compris lorsque leur ouverture et leur clôture viennent de fichiers différents.
- La sauvegarde est propre au navigateur et à l’adresse du site : elle n’est pas synchronisée entre appareils et disparaît si les données du navigateur sont effacées. « Sauvegarder en CSV » permet d’exporter tout l’historique et de le réimporter ailleurs.
- « Ajouter un autre CSV » conserve les imports précédents. L’effacement complet utilise une action séparée avec confirmation.
- Un fichier invalide ou un refus d’écriture du navigateur annule l’import sans modifier l’historique précédent.

Développement : `npm ci`, puis `npm run dev`. Vérification : `npm test`, `npx tsc --noEmit`, `npm run build`. Les tests utilisent Node.js 24 pour exécuter directement les modules TypeScript.

## Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
