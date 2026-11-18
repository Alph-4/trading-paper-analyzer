# Trading desk — 17 novembre 2026

Espace de préparation de session disponible sur `/desk`, sans import de trades préalable. La racine du site ouvre ce desk. Les analyses du journal restent accessibles sur leurs routes existantes.

## Fonctions

- Vue d’ensemble : cours FX de référence et historique, veille S&P 500 / Nasdaq 100 / VIX / futures or / WTI / DXY, force des devises contre USD, courbe US et spread 10 ans–2 ans.
- Sentiment : positionnement hebdomadaire CFTC des leveraged funds ; relevés retail Myfxbook ou IG saisis par l’utilisateur avec source et date. Le COT et le sentiment retail restent deux populations distinctes.
- Graphiques et agenda : widgets officiels TradingView avec sélection FX, XAUUSD spot, S&P, Nasdaq, DAX, DXY et taux US10Y. Les widgets chargent leurs données directement depuis TradingView ; délais et disponibilités dépendent des marchés et du fournisseur. Le graphique est configuré en heure de Paris ; vérifier le fuseau du calendrier dans le widget.
- Saisonnalités : historiques automatiques FX, S&P 500, Nasdaq 100, DAX et futures or ; moyenne et médiane annuelles, comparaison avec l’année en cours, heatmap mensuelle, fenêtre long/short et comparaison des horizons 7/14/30/60/90 jours. Un import CSV permet d’utiliser d’autres séries.
- Plans de session FX, or, S&P, Nasdaq et DAX : biais, scénario, niveaux, invalidation, annonces, bilan, checklist et export JSON. Budget de risque linéaire, sans conversion en lots.

## Démarrage et hébergement

`npm ci`, puis `npm run dev`. Le middleware Vite expose `/api/market?pair=EURUSD&years=10` et `/api/history?symbol=SPX&years=10` en développement et en preview. Le second endpoint accepte SPX, NDX, DAX et GOLD. `npm run build` produit le client dans `dist`.

Un simple hébergement de fichiers `dist` ne suffit pas : l’API Node doit aussi être disponible. Des adaptateurs Vercel sont fournis dans `api/market.mjs` et `api/history.mjs`. Aucune clé API, aucun abonnement et aucune base de données ne sont nécessaires pour les flux actuels. Aucun déploiement n’a été effectué dans cette intervention.

Sur Vercel, conserver les fichiers `api` et `server`, Node 24, et router les chemins SPA vers `index.html` après les routes API (voir `vercel.json`). Pour un autre hébergeur, adapter `marketHttpHandler` derrière une route serveur `/api/market` et configurer le fallback SPA.

## Sources et limites

| Bloc | Source | Fréquence / interprétation |
| --- | --- | --- |
| FX et saisonnalité FX | [BCE via Frankfurter v2](https://frankfurter.dev/) avec fournisseur `ecb` | Références quotidiennes, jusqu’à 20 années closes ; aucune cotation exécutable |
| Taux US | [U.S. Treasury](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed) | Courbe nominale au pair quotidienne, 1/3/6 mois, 1/2/5/10/30 ans ; variations en points de base |
| Positionnement | [CFTC TFF futures only](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm) | Leveraged money, devises contre USD, généralement positions du mardi publiées le vendredi ; ni spot ni retail |
| Veille multi-actifs | [Yahoo Finance](https://finance.yahoo.com/) | Deux dernières clôtures quotidiennes antérieures à aujourd’hui UTC ; pas d’intraday. GC=F représente les futures or, pas XAUUSD |
| Historiques multi-actifs | [Yahoo Finance](https://finance.yahoo.com/) | Jusqu’à 20 ans, colonne Adjusted Close prioritaire. SPX et NDX sont des indices de prix ; DAX est un indice de performance avec dividendes ; futures or avec limites de raccordement |
| Graphiques et agenda | [Widgets TradingView](https://www.tradingview.com/widget-docs/) | Flux tiers intégrés avec attribution et liens ; disponibilité dépendante du fournisseur |
| Retail | [Myfxbook](https://www.myfxbook.com/community/outlook), [IG](https://www.ig.com/en/forex/markets-forex) | Saisie manuelle datée ; les relevés de plus de 24 h sont signalés |

Yahoo utilise un endpoint public non contractuel. Ses droits de redistribution commerciale et ceux de chaque flux doivent être vérifiés avant diffusion à des clients payants. Les providers peuvent bloquer, retarder ou réviser leurs données. Une source indisponible produit une erreur explicite ; aucune valeur fictive n’est injectée. Les dates d’observation sont affichées. L’API utilise un cache en mémoire de 30 minutes et des délais de requête de 18 secondes ; le bouton Actualiser respecte ce cache.

La force des devises est calculée contre USD sur cinq observations BCE. USD vaut donc zéro ; il ne s’agit pas d’un indice de force pondéré. Le spread obligataire concerne seulement les États-Unis : les différentiels souverains entre pays et les taux réels ne sont pas encore intégrés.

## Méthode saisonnière

Les fonctions pures sont dans `src/lib/seasonality.ts`. Une année historique doit être close, contenir au moins 220 observations, au moins 15 par mois, couvrir début janvier et fin décembre, et ne pas avoir de lacune de plus de 10 jours. L’année courante est tracée séparément et exclue des statistiques.

Chaque trajectoire annuelle est rebasée à sa première clôture. Moyenne arithmétique et médiane sont calculées sur les mêmes années ; les jours fermés reprennent la dernière clôture. Le 29 février est retiré de la grille comparable. Les rendements mensuels vont de clôture de fin de mois à clôture de fin de mois ; janvier est absent si la clôture de décembre précédent manque.

Pour une fenêtre, entrée et sortie sont les premières clôtures disponibles à partir des bornes calendaires, dans un délai maximal de sept jours. Une fenêtre traversant le Nouvel An exige deux années closes couvertes. Les dates réellement retenues et chaque résultat sont consultables. Le short correspond à l’opposé du rendement du sous-jacent à notionnel initial fixe. Ni frais, financement, spread, levier ni conversion de devise ne sont inclus.

Le taux de réussite est une fréquence observée, pas une probabilité prédictive. Le screener trie plusieurs durées sur les mêmes données : il est exploratoire et soumis au surajustement. La méthode n’est pas une reproduction exacte des calculs propriétaires de Seasonax ou d’Equity Clock. Références fonctionnelles consultées : [Seasonax Screener](https://www.seasonax.com/seasonality-screener/) et [Equity Clock EURUSD](https://charts.equityclock.com/euro-to-us-dollar-eurusd-seasonal-chart). Leurs courbes et jeux de données ne sont ni extraits ni republiés.

En complément des historiques automatiques, importer un CSV quotidien `Date,Close` (date ISO `AAAA-MM-JJ`), 5 Mo maximum. `Adj Close` est prioritaire lorsqu’il existe. Un historique de prix ajustés est nécessaire pour éviter les distorsions de splits/dividendes ; les séries de futures exigent aussi de connaître la méthode de raccordement. L’import reste en mémoire pendant la visite du desk, y compris entre ses onglets ; il n’est pas enregistré ni envoyé à un serveur.

## Recherche et couverture

| Question | Éléments vérifiés | Limite |
| --- | --- | --- |
| Quelles fonctions saisonnières reprendre ? | Pages publiques officielles Seasonax et Equity Clock : recherche de fenêtres, fréquence positive, rendement, choix de la période ; moyennes arithmétique/géométrique annoncées par Equity Clock | Aucune inspection d’un compte payant ni validation des algorithmes privés. Le moteur développé ici utilise sa propre méthode explicite |
| Les sources répondent-elles réellement ? | Vérifications réseau des flux FX, Treasury, CFTC et Yahoo ; quatre historiques indices/or chargés sur dix ans | Disponibilité observée le 17 novembre 2026, susceptible d’évoluer |
| Les calculs gèrent-ils les données manquantes ? | Tests reproductibles des années incomplètes, dates, mois, week-ends, 29 février et passage décembre/janvier | Analyse descriptive ; aucune performance future validée |
| L’interface fonctionne-t-elle ? | Vue d’ensemble, saisonnalité FX, widgets graphique/agenda et sauvegarde/rechargement d’un plan or observés dans le navigateur Codex ; estimation du risque contrôlée | L’ajout final du sélecteur d’historiques indices/or est validé par TypeScript, compilation et données réelles, mais n’a pas pu être revu visuellement après indisponibilité de l’outil navigateur |

Le dépôt source étant complet, la skill REA a été suivie pour la démarche d’analyse et les limites des observations ; aucune décompilation ni capture privée de produits tiers n’était nécessaire. Il n’y a donc pas de référence Evidence REA à associer aux fonctions reconstruites.

## Sauvegarde et vérification

Plans et relevés retail : stockage local versionné dans le navigateur, distinct des exports TradingView existants. Jusqu’à 90 plans sont conservés, sans synchronisation inter-appareils. Les refus d’écriture sont signalés. Le plan JSON sert de sauvegarde externe ; l’import de plans JSON n’est pas implémenté.

Vérifier avec `npm test`, `npx tsc --noEmit`, `npm run build`, puis ouvrir `/desk` et parcourir ses quatre onglets. Les tests couvrent les formats de données, dates, calculs de taux/FX, échecs des providers, années incomplètes, fenêtres traversant le Nouvel An, CSV de prix et budget de risque. Les valeurs réelles évoluent : les tests réseau ne font pas partie de la suite reproductible.

Résultat de cette intervention : 47 tests réussis, TypeScript et compilation production réussis. Le lint global reste en échec sur quatre erreurs préexistantes dans `Dashboard.jsx`, `RiskPanel.jsx`, `src/utils/analytics.js` et `tailwind.config.js`. Le build signale également la taille du chunk principal et une base Browserslist ancienne ; aucun changement de dépendances n’a été effectué.
