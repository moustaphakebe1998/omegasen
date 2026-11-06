# Environnement de test « Restaurant Baobab »

Un restaurant unique, **Restaurant Baobab** (`slug` : `baobab`), avec des comptes pour chaque profil et assez de données pour tester presque toute l'application. Cela couvre le scan d'un QR Code de table, la cuisine, l'encaissement, les statistiques et l'historique.

- Code du jeu de données : `backend/app/seeds/baobab.py`.
- Commandes : `backend/app/cli.py`.
- Tests : `backend/tests/test_baobab_environment.py` (API) et `frontend/e2e/baobab.spec.ts` (interface).

> Les données Baobab sont **fictives et réservées au test**. Le restaurant est marqué `is_demo = true` et tous les comptes sont en `@baobab.test`, un domaine réservé (RFC 2606) qui ne peut appartenir à personne. Les commandes refusent de s'exécuter en production.

## 1. Initialiser

Prérequis : PostgreSQL et Redis démarrés et migrations appliquées. `./dev.sh` fait tout cela. Pour les photos, le stockage S3 local doit tourner, ce que `./dev.sh` fait aussi.

```bash
cd backend
.venv/bin/alembic upgrade head                # ajoute la colonne restaurants.is_demo
.venv/bin/python -m app.cli seed-baobab       # crée ou complète Baobab, puis affiche les comptes
```

| Commande (`cd backend`) | Effet |
|---|---|
| `.venv/bin/python -m app.cli seed-baobab` | Crée Baobab, ou complète ce qui manque. **Idempotent** : relancée, elle ne crée aucun doublon. Elle remet aussi les comptes de test en état de connexion : mot de passe de démo, compte déverrouillé, compteurs de connexion effacés. |
| `… seed-baobab --no-images` | Idem, sans les photos (utile si le stockage S3 est arrêté). |
| `… reset-baobab` | Supprime **uniquement** Baobab, puis le recrée à l'identique (mêmes identifiants, même QR Code). |
| `… delete-baobab` | Supprime **uniquement** Baobab et les comptes `@baobab.test` qui ne servent qu'à lui. |
| `… baobab-accounts` | Affiche les comptes, les rôles et les liens utiles (connexion, menu, QR, cuisine, caisse). |

Le stockage d'images de développement (`moto`) est en mémoire. Après un redémarrage de `./dev.sh`, relancez `seed-baobab` pour restaurer les photos de Baobab.

### Garde-fous

- **Production** : `seed`, `reset` et `delete` sont refusés (`ENVIRONMENT=production`). Les adresses `.test` ne sont acceptées que hors production (`allow_test_email_domain`, dans `app/core/config.py`).
- **Restaurant réel** : si un restaurant `baobab` existe sans être marqué `is_demo`, rien n'est créé, modifié ni supprimé, et la commande échoue avec un message explicite.
- **Suppression ciblée** : seul le restaurant `is_demo` d'identifiant ou de slug Baobab est supprimé. Un compte `@baobab.test` qui est aussi membre d'un autre restaurant, ou un super admin, est conservé. Les autres restaurants et comptes ne sont jamais touchés (vérifié par `test_reset_only_touches_baobab`).
- **Mots de passe** : hachés en Argon2id par `hash_password`, comme partout ailleurs. Aucun mot de passe n'est stocké en clair.
- **Identifiants stables** : UUID v5 dérivés de noms fixes pour le restaurant (`06032410-037f-52f4-a290-f8de5d3acc55`), les comptes, les catégories, les plats, les options et les réservations. Le QR Code est fixe (`baobab26`), donc les QR imprimés restent valables après un `reset-baobab`.
- **Démo historique** : le restaurant `le-baobab-demo` (`seed-demo`, comptes `@demo.example.com`, utilisé par les tests e2e et les captures `/demo`) est indépendant et n'est pas modifié.

## 2. Comptes de test

Mot de passe commun : **`BaobabTest2026!`**. Connexion : http://localhost:3100/login

| Profil | Identifiant | Rôle OmegaSen | Arrive sur |
|---|---|---|---|
| Propriétaire | `owner@baobab.test` | `OWNER` | `/manage/{id}` |
| Administrateur | `admin@baobab.test` | `ADMIN` | `/manage/{id}` |
| Responsable | `manager@baobab.test` | `MANAGER` | `/manage/{id}` |
| Caissier | `cashier@baobab.test` | `CASHIER` | `/pos/{id}` (caisse) |
| Serveur | `waiter@baobab.test` | `WAITER` | `/pos/{id}` (prise de commande) |
| Cuisinier | `kitchen@baobab.test` | `KITCHEN` (poste Grill) | `/kitchen/{id}` |
| Utilisateur standard | `user@baobab.test` | `STAFF` | `/manage/{id}` |
| Clients | `client.aminata@`, `client.moussa@`, `client.khadija@`, `client.pierre@baobab.test` | compte client | `/compte` |
| Invitation en attente | `invite@baobab.test` | `CASHIER` | ne peut pas se connecter (lien d'activation non utilisé) |

Le super admin de la plateforme (`SUPERADMIN_EMAIL` dans `.env`) voit aussi Baobab dans `/admin`.

Chaque compte utilise le **préréglage de son rôle** (`backend/app/core/permissions.py`), sans ajustement. Le propriétaire peut ensuite ajouter ou retirer des permissions à chacun dans « Équipe ». La hiérarchie, les règles de suspension et le détail des permissions sont décrits dans [`ACCESS_CONTROL.md`](ACCESS_CONTROL.md).

Permissions effectives (générées depuis le code, vérifiées par `test_permission_matrix_is_enforced_by_the_api`) :

| Permission | OWNER | ADMIN | MANAGER | CASHIER | WAITER | KITCHEN | STAFF |
|---|---|---|---|---|---|---|---|
| `restaurant.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `restaurant.edit` | ✅ | ✅ | — | — | — | — | — |
| `settings.edit` | ✅ | ✅ | — | — | — | — | — |
| `media.manage` | ✅ | ✅ | — | — | — | — | — |
| `qr.manage` | ✅ | ✅ | — | — | — | — | — |
| `menu.view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `menu.create` | ✅ | ✅ | ✅ | — | — | — | — |
| `menu.edit` | ✅ | ✅ | ✅ | — | — | — | — |
| `menu.delete` | ✅ | ✅ | — | — | — | — | — |
| `prices.edit` | ✅ | ✅ | — | — | — | — | — |
| `stock.manage` | ✅ | ✅ | ✅ | ✅ | — | ✅ | — |
| `orders.history` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| `orders.create` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| `orders.prepare` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `orders.cancel` | ✅ | ✅ | ✅ | ✅ | — | — | — |
| `payments.record` | ✅ | ✅ | ✅ | ✅ | — | — | — |
| `payments.refund` | ✅ | ✅ | — | — | — | — | — |
| `reservations.view` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| `reservations.manage` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| `stats.view` | ✅ | ✅ | ✅ | — | — | — | — |
| `team.view` | ✅ | ✅ | ✅ | — | — | — | — |
| `team.manage` | ✅ | ✅ | ✅ | — | — | — | — |
| `activity.view` | ✅ | ✅ | — | — | — | — | — |

Chaque route du backend exige sa permission (`Can(Perm.…)`). L'interface masque ce qui n'est pas permis, mais **l'API refuse de toute façon** : `403 permission_denied` hors permission, `404` pour un autre restaurant, `401` sans connexion. Un responsable ne peut accorder que les droits qu'il possède.

## 3. Données créées

| Domaine | Contenu |
|---|---|
| Restaurant | `Restaurant Baobab`, « Restaurant de démonstration OmegaSen », actif, Dakar, XOF, TVA 18 %, ouvert 7 j/7 de 00:00 à 23:59 (commandes publiques possibles à toute heure). Logo, couverture et galerie de 3 photos. Postes de cuisine : Grill, Froid, Bar. |
| Menu | 4 catégories (Entrées, Plats, Desserts, Boissons), 22 plats avec descriptions, allergènes et étiquettes, et 10 photos. Plats **indisponibles** : Soupe kandja, Thiou poisson, Glace au bissap. Plat **masqué** aux clients : Plat du chef. **Options** : accompagnement obligatoire (option Attiéké indisponible), suppléments payants de 0 à 3, cuisson, taille, sucre. **Promotions datées** : Salade Baobab et Bissap en cours, Soda à venir. |
| Tables et QR | Tables `T1` à `T10`. QR du restaurant : `/q/baobab26`. QR d'une table : `/q/baobab26?table=T5`, qui préremplit la table. Téléchargeable en PNG, SVG ou PDF A4/A6 via `?table=T5` ou la carte « QR Code d'une table » de la page QR Code. |
| Commandes du jour (12) | Tous les statuts (Nouvelle, En préparation, Prête, Terminée, Annulée) et tous les canaux (QR Code, Guichet, En ligne, Borne). Sur place avec table ou à emporter. Paiement non payé, payé, **partiellement payé** (T4) ou **remboursé**. Moyens : espèces, carte, Mobile Money. Une annulation depuis « En préparation ». Commandes saisies par la caisse et par le serveur (T7, à encaisser). |
| Historique (14 jours) | Une soixantaine de commandes terminées ou annulées, avec paiements, rattachées en partie aux clients. Elles alimentent les statistiques : chiffre d'affaires par jour, heure et canal, top produits, temps moyen de préparation. |
| Clients | 4 comptes clients (nom, e-mail, téléphone fictif) avec historique de commandes (`/compte`) et réservations. |
| Réservations | 7, une par statut : en attente, confirmée, installée, absente, refusée (avec motif) et annulée. |
| Notifications | « Nouvelle commande » (propriétaire et responsables) et « Commande prête » (caisse et responsables, plus le client s'il a un compte) pour les commandes du jour. |
| Journal d'activité | Création du restaurant et de chaque commande, changements de statut, paiements, remboursement. Visible dans `/admin/audit` (super admin). |
| Équipe | 7 collaborateurs (dont 3 aux permissions ajustées), affectation au poste Grill et 1 invitation en attente (renvoi du lien possible depuis « Équipe »). |

Les commandes passent par le **vrai moteur** (`place_order`, `change_status`, `record_payment`) : prix recalculés côté serveur, TVA extraite, numéros du jour, historique des statuts et notifications. L'historique est ensuite daté sur les 14 jours précédents. Le journal d'activité, lui, garde l'heure réelle de l'initialisation.

## 4. Que tester avec chaque compte

| Compte | À vérifier |
|---|---|
| **owner** | Toutes les rubriques. Équipe : ajouter un collaborateur, ajuster ses permissions, nommer un propriétaire, renvoyer l'invitation de `invite@`. Établissement : informations, paramètres, horaires, images. Personnaliser le QR et télécharger le QR d'une table. Modifier les prix. Rembourser un paiement. Statistiques. |
| **admin** | Comme owner, sauf nommer ou retirer un propriétaire (refusé). |
| **manager** | Commandes, menu (modification sans prix ni suppression), ruptures, réservations, statistiques, équipe (ne peut accorder que ses droits). Établissement et QR Code en **lecture seule**. Remboursement refusé. |
| **cashier** | Caisse : commande au guichet, encaissement (espèces avec rendu de monnaie, carte, Mobile Money), commandes prêtes à remettre, annulation avec motif, réservations, ruptures. Pas de statistiques ni d'équipe. |
| **waiter** | Caisse en mode « prise de commande » : commande pour une table, avec le bouton « Envoyer la commande » à la place d'« Encaisser » (la commande part en cuisine non payée). Suivi des commandes prêtes et passage à « Terminée » une fois servie. Réservations. Encaissement et annulation refusés. |
| **kitchen** | Écran cuisine (poste Grill présélectionné) : Commencer, Prête, retour arrière. Ruptures de stock. Aucun accès aux commandes (historique), à l'équipe, aux statistiques ni aux paramètres. |
| **user** | Vue d'ensemble, menu, QR Code et établissement en consultation. Toutes les autres rubriques affichent « Accès non autorisé ». |
| **clients** | `/compte` : historique des commandes et réservations, sessions. Commander depuis le QR d'une table en étant connecté : la commande apparaît dans l'historique et le client est notifié quand elle est prête. |

## 5. Scénario complet

1. Ouvrir http://localhost:3100/q/baobab26?table=T6 (scan du QR de la table T6), en étant éventuellement connecté avec `client.aminata@baobab.test`.
2. Consulter le menu : plats indisponibles non sélectionnables, badge « Promo » sur Salade Baobab et Bissap, plat masqué absent.
3. Ajouter « Yassa poulet » au panier.
4. Le personnaliser : accompagnement **Frites**, supplément **Oignons confits**.
5. Commander : le mode « Sur place » et la table **T6** sont préremplis. Saisir un prénom et valider, ce qui ouvre la page de suivi.
6. `owner@` : la commande apparaît dans **Commandes** (canal QR Code, table T6) et une notification arrive.
7. `kitchen@` : la commande apparaît sur l'**écran cuisine**.
8. **Commencer** : la commande passe en préparation et le suivi client se met à jour en direct.
9. **Prête** : le client voit « Votre commande est prête ».
10. `waiter@` (ou `cashier@`) : la commande est visible dans les commandes prêtes de la caisse.
11. `cashier@` : **Encaisser** en espèces (le rendu de monnaie s'affiche), par carte ou en Mobile Money.
12. Passer la commande à **Terminée** (serveur ou caisse).
13. `owner@` → **Statistiques** : commandes, chiffre d'affaires et top produits incluent la commande. Le client la retrouve dans `/compte`, et l'historique des statuts est visible dans le détail de la commande.

### Cas d'erreur à vérifier

| Cas | Résultat attendu |
|---|---|
| Plat indisponible (Thiou poisson) ou masqué | `422 product_unavailable`, bouton grisé dans le menu |
| Option indisponible (Attiéké) ou choix obligatoire manquant | `422 invalid_options` |
| Livraison | `422 service_mode_unavailable` (non activée dans OmegaSen) |
| Commande annulée | Ni paiement (`order_cancelled`) ni changement de statut (`invalid_transition`) |
| Annulation sans motif | `422` |
| Espèces insuffisantes / montant supérieur au reste à payer (T4) / déjà payée | `insufficient_cash` / `invalid_amount` / `already_paid` |
| Paiement en ligne | `503 online_payment_unavailable` : aucun prestataire n'est branché, et aucun paiement n'est simulé |
| Accès non autorisé | `403 permission_denied` (rôle), `404` (autre restaurant), `401` (non connecté) |
| QR inconnu / table invalide (`?table=T 5`) | Page « QR Code inconnu » / `422` sur le téléchargement, table ignorée côté page |

## 6. Tests automatisés

```bash
cd backend && .venv/bin/pytest tests/test_baobab_environment.py   # 15 tests, base *_test isolée
cd frontend && npx playwright test e2e/baobab.spec.ts               # application lancée + seed-baobab
```

Tests backend :
- seed idempotent, identifiants stables, Argon2id ;
- refus en production ou face à un vrai restaurant `baobab` ;
- connexion de tous les comptes, rattachement à Baobab, invitation non connectable ;
- matrice des permissions sur 17 actions × 7 profils, appelée directement sur l'API ;
- un responsable ne peut pas accorder de droits qu'il n'a pas ;
- isolation entre restaurants ;
- parcours complet, de la table QR au paiement, avec mise à jour des statistiques, du suivi et des notifications ;
- cas d'erreur, couverture de tous les statuts et canaux, QR de table (PNG, SVG, PDF) ;
- reset limité à Baobab.

Tests e2e :
- chaque compte arrive sur le bon écran ;
- pages refusées pour l'utilisateur standard et la cuisine ;
- parcours QR de table → cuisine → caisse dans le navigateur.

Si un compte est verrouillé ou limité après beaucoup de tentatives (5 échecs, ou 10 connexions en 5 minutes), relancer `seed-baobab`.

## 7. Limites et fonctionnalités non implémentées

Rien n'a été simulé pour combler ces manques :

- **Tables** : pas d'entité « table » (plan de salle, statut occupée ou libre). Une table est une étiquette sur la commande (`table_label`), portée par le QR de table.
- **Statuts** : pas d'« en attente de confirmation », de « confirmée » ni d'« en livraison ». Le cycle est Nouvelle → En préparation → Prête → Terminée, plus Annulée. L'attente de paiement n'existe qu'avec l'option « prépaiement obligatoire », désactivée sur Baobab.
- **Livraison** : non activée (refusée par l'API).
- **Paiement en ligne et paiement échoué** : aucun prestataire configuré (`503`). Les transactions « échouées » n'existent qu'avec un prestataire, donc aucune n'est créée.
- **Réductions** : seules existent les promotions datées sur un plat. Il n'y a ni code promo ni remise sur la commande (`discount` reste à 0).
- **Stocks** : disponibilité oui/non uniquement (ruptures), sans quantités.
- **Abonnement / facturation de la plateforme** : n'existe pas dans OmegaSen.
- **Photos** : sans stockage S3 démarré, `seed-baobab` crée les données sans photos et le signale. Le relancer plus tard suffit.
