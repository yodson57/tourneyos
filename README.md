# TourneyOS — déploiement

## 0. Ce qui a changé dans ce ZIP par rapport au précédent
- `src/App.jsx` : l'écoute Firestore de la collection `events` n'avait **aucun gestionnaire
  d'erreur** → si les règles bloquaient la lecture, la liste restait vide **sans aucune erreur
  visible**. Corrigé : toute erreur de lecture s'affiche maintenant en rouge dans "Mes événements".
- Le bouton "Créer l'événement" est maintenant protégé par un `try/catch` avec une alerte
  visible en cas d'erreur inattendue — plus aucun échec silencieux possible.
- `firestore.rules` réécrites simplement (voir le fichier, avec commentaires) pour éviter le
  piège précédent (une règle imbriquée avait cassé la lecture de toute la collection `events`).

## 1. Créer/valider le projet Firebase
1. Va sur https://console.firebase.google.com et ouvre ton projet (`tourneyos-prod`).
2. **Authentication** → onglet Sign-in method → active "E-mail/Mot de passe".
3. **Firestore Database** → crée la base si ce n'est pas fait (mode production, région eur3 par ex.).
4. **Storage** → nécessite le forfait Blaze (paiement à l'usage) pour être activé. Tant que ce
   n'est pas fait, l'upload de logos/photos restera indisponible — le reste de l'app fonctionne
   sans.

## 2. Publier les règles Firestore/Storage (sans terminal ni VS Code)
Le plus simple, 100% dans le navigateur :
1. Ouvre **Firestore Database** → onglet **Règles** dans la Console Firebase.
2. Colle le contenu du fichier `firestore.rules` de ce ZIP, remplace tout, clique **Publier**.
3. Si Storage est activé : fais pareil dans **Storage** → onglet **Règles** avec `storage.rules`.

## 3. Récupérer la config Firebase (les clés VITE_FIREBASE_*)
Dans la Console Firebase : **Paramètres du projet** (icône ⚙️) → en bas, section "Vos applications"
→ si aucune app Web n'existe, clique "Ajouter une application" → Web (icône `</>`). Tu obtiens un
objet `firebaseConfig` avec `apiKey`, `authDomain`, `projectId`, `storageBucket`,
`messagingSenderId`, `appId`. Garde cette page ouverte, ces valeurs servent à l'étape 5.

## 4. Mettre le code sur GitHub (glisser-déposer, sans terminal)
1. Va sur https://github.com/new, crée un nouveau dépôt (ex. `tourneyos`).
2. Sur la page du dépôt vide, clique "uploading an existing file".
3. Glisse-dépose **tout le contenu** de ce ZIP (pas le ZIP lui-même, son contenu décompressé) :
   dossier `src/`, `index.html`, `package.json`, `vite.config.js`, `tailwind.config.js`,
   `postcss.config.js`, `firestore.rules`, `storage.rules`, `firebase.json`.
4. Valide ("Commit changes").

## 5. Déployer sur Vercel
1. Va sur https://vercel.com, connecte-toi avec GitHub, clique "Add New… → Project".
2. Sélectionne le dépôt `tourneyos` que tu viens de créer.
3. Avant de cliquer "Deploy", ouvre **Environment Variables** et ajoute, une par une, les 6
   clés récupérées à l'étape 3 (copie-colle chaque valeur telle quelle) :
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. Clique **Deploy**. Vercel détecte Vite automatiquement.
5. Une fois déployé, copie l'URL Vercel (ex. `tourneyos.vercel.app`).

## 6. Autoriser le domaine Vercel dans Firebase Auth
Dans la Console Firebase : **Authentication** → onglet **Settings** → **Authorized domains** →
"Add domain" → colle ton domaine Vercel (sans `https://`).

## 7. Créer le tout premier compte super-admin
Il n'existe encore aucun compte. Dans la Console Firebase :
1. **Authentication** → "Add user" → renseigne un e-mail + mot de passe.
2. **Firestore Database** → collection `users` → "Add document" → l'ID du document doit être
   **exactement** l'UID généré à l'étape précédente (visible dans la liste Authentication) →
   ajoute les champs : `name` (string), `role` (string, valeur `super_admin`).
3. Connecte-toi sur le site avec cet e-mail/mot de passe (le login par identifiant ne
   fonctionnera qu'à partir du 2e compte créé depuis l'app elle-même).

## 8. Tester la création d'un événement
Une fois connecté en super-admin : va dans "Mes événements", tape un nom, clique "Créer
l'événement". Si une erreur apparaît maintenant (bandeau rouge), elle indiquera précisément
la cause (permission Firestore, réseau, etc.) — envoie-moi ce message d'erreur exact si ça
bloque encore.

## En cas de redéploiement futur
Comme le déploiement se fait via GitHub → Vercel, il suffit de remplacer les fichiers modifiés
sur GitHub (glisser-déposer à nouveau, "Commit changes") — Vercel redéploie automatiquement en
1-2 minutes, sans terminal.
