# TSARA TÔLE EUROPÉENNE — plateforme e-commerce

## Contenu
- Frontend responsive : boutique, catalogue, recherche, filtres, panier, calculateur et formulaire WhatsApp.
- Backend Node.js / Express : API produits, création de commandes, espace administrateur.
- Base de données SQLite : produits, comptes administrateurs, commandes et lignes de commande.
- Interface admin : statistiques, suivi des commandes, modification des statuts, gestion des produits et stocks.

## Lancer en local
Prérequis : Node.js 18 ou plus récent.

1. Décompresser le ZIP.
2. Dans le dossier du projet, copier `.env.example` vers `.env`.
3. Modifier `SESSION_SECRET` et `ADMIN_PASSWORD` dans `.env` avec des valeurs secrètes et robustes.
4. Installer les dépendances : `npm install`
5. Lancer : `npm start`
6. Ouvrir `http://localhost:3000`
7. Administration : `http://localhost:3000/admin`

Le compte administrateur est créé au premier démarrage à partir de `ADMIN_EMAIL` et `ADMIN_PASSWORD` si aucun compte correspondant n'existe déjà.

## Publication en ligne
Ce projet a besoin d'un hébergeur qui exécute Node.js (par exemple Render, Railway ou un VPS). Un hébergement statique seul comme Netlify Drop ne peut pas exécuter ce backend.
- Définir les variables d'environnement de `.env` dans le tableau de bord de l'hébergeur.
- Utiliser un disque persistant et définir `DB_PATH` vers ce disque, sinon la base SQLite peut être perdue lors d'un redéploiement.
- Définir `NODE_ENV=production`, un `SESSION_SECRET` long et unique, et un mot de passe admin fort.
- Ajouter un certificat HTTPS (généralement fourni par l'hébergeur).
- Tester les commandes et le tableau de bord avant de partager le lien public.

## Important — tarifs et règles commerciales
Les tarifs Galvabac et Aluzinc ont été saisis à partir de la liste fournie. Leur unité n'était pas explicitement indiquée dans cette liste ; le projet les traite actuellement comme des prix au mètre pour le calcul. Confirmer cette unité avant la mise en production.
La commande est enregistrée en base de données et les clients sont ensuite dirigés vers WhatsApp. Aucun paiement en ligne n'est activé dans cette version.
Les quantités commandées diminuent le stock ; les stocks initiaux sont des valeurs de démonstration (500/1000) et doivent être corrigés dans l'administration.

## Structure
- `server.js` : backend et API
- `public/index.html`, `public/style.css`, `public/app.js` : boutique
- `public/admin.html`, `public/admin.js` : administration
- `public/logo.jpg` : logo officiel
- `.env.example` : variables à configurer
