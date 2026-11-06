# Rôles, permissions et contrôle d'accès

Ce document décrit le modèle d'accès d'OmegaSen : deux niveaux strictement séparés (plateforme et restaurant), une hiérarchie de rôles, des permissions granulaires ajustables par collaborateur, et le statut du restaurant comme règle centrale. Il s'appuie sur ces fichiers :

- `backend/app/core/access.py` : hiérarchie, statut des restaurants, révocation des sessions ;
- `backend/app/core/permissions.py` : catalogue des permissions et préréglages des rôles ;
- `backend/app/core/deps.py` : contrôles appliqués à chaque requête ;
- `backend/app/modules/ws.py` : temps réel.

## 1. Diagnostic (avant la refonte)

| # | Problème | Gravité |
|---|---|---|
| 1 | **Élévation de privilèges** : la création directe d'un collaborateur avec mot de passe s'appliquait aussi à un compte existant **non activé**. Un propriétaire pouvait fixer le mot de passe d'un compte invité par un autre restaurant, ou d'un **super admin créé mais pas encore activé**, puis se connecter avec. | Critique |
| 2 | **Suspension et fermeture incomplètes** : seules les routes `/api/restaurants/{id}/…` étaient refusées. La connexion, le renouvellement de session, `/me`, les notifications et l'espace client restaient ouverts. Aucune session n'était révoquée, et les WebSockets déjà ouvertes continuaient de recevoir les commandes. Les messages restaient génériques (« Ce restaurant est suspendu »). | Élevée |
| 3 | **PENDING** : tous les membres avaient accès au restaurant en attente d'activation. | Moyenne |
| 4 | **WebSocket restaurant** : tout membre (même sans droit sur les commandes) recevait le flux des commandes. Les droits n'étaient vérifiés qu'à la connexion. | Élevée |
| 5 | **Hiérarchie** : seuls 4 rôles existaient. Un responsable pouvait modifier un autre responsable. Un propriétaire pouvait ajouter un super admin à son équipe et modifier son rattachement. | Moyenne |
| 6 | **Super admin** : `POST /api/restaurants` le rendait propriétaire du restaurant créé. Il manquait la réinitialisation de mot de passe, la suppression sécurisée (utilisateur, restaurant), les compteurs par statut, le filtre par statut et le motif de suspension. | Moyenne |
| 7 | **Traçabilité** : l'état « avant » manquait dans les modifications d'utilisateurs par la plateforme, et le restaurant n'avait pas de journal d'activité propre. | Faible |

Tous ces points sont corrigés et couverts par des tests (§ 8).

## 2. Architecture

```
Requête authentifiée ─► deps.current_user
                         1. jeton d'accès valide (JWT 15 min)
                         2. compte existant et actif (relu en base à CHAQUE requête)
                         3. mot de passe initial changé
                         4. compte non bloqué par le statut de ses restaurants (access.account_block)
Route /api/restaurants/{id}/… ─► deps.resolve_context (Can(Perm.X))
                         5. appartenance active au restaurant (sinon 404 : existence non révélée)
                         6. statut du restaurant compatible avec le rôle (access.restaurant_block)
                         7. permission précise exigée par la route
                         puis chaque ressource est chargée filtrée par restaurant_id (sinon 404)
Super admin ─► passe les étapes 4 à 7 sur tous les restaurants, quel que soit leur statut
```

Toutes les décisions sont prises **côté serveur**. L'interface n'en est que le reflet : elle reçoit les permissions effectives et le motif de blocage dans `/api/auth/me`.

## 3. Hiérarchie des rôles

**Niveau plateforme : super admin** (`User.is_superadmin`). Il est propriétaire de la plateforme et a tous les droits sur tous les restaurants et tous les comptes, sans être membre d'aucun restaurant. Il ne devient jamais propriétaire d'un restaurant : un compte super admin ne peut pas être rattaché à un restaurant, et la plateforme garde toujours au moins un super admin actif. Il n'existe aucune création publique de super admin : seul `python -m app.cli bootstrap` (variables d'environnement) ou un super admin existant peut en créer un.

**Niveau restaurant** (`Membership.role`, un rôle par restaurant) :

| Rang | Rôle | Libellé | Préréglage |
|---|---|---|---|
| 100 | `OWNER` | Propriétaire | Tout, toujours (non restreignable). Seul à nommer, modifier ou retirer un propriétaire. |
| 80 | `ADMIN` | Administrateur | Tout par défaut (restreignable). |
| 60 | `MANAGER` | Responsable | Gestion quotidienne, sans paramètres, prix, suppressions, images, QR Code ni remboursements. |
| 20 | `CASHIER` | Caisse | Guichet, encaissement, annulation, réservations, ruptures. |
| 20 | `WAITER` | Service en salle | Prise de commande, suivi et service ; ni encaissement ni annulation. |
| 20 | `KITCHEN` | Cuisine | Écran cuisine et ruptures. |
| 10 | `STAFF` | Personnel | Consultation ; les autres droits s'accordent individuellement. |

**Règles de gestion d'équipe** (`team.py`) :
- il faut `team.manage` pour agir sur l'équipe ;
- on ne gère, et on n'attribue, que des rôles **strictement inférieurs** au sien : un administrateur gère les responsables et le personnel, un responsable le personnel ;
- un propriétaire gère tout le monde ;
- on n'accorde jamais une permission qu'on n'a pas soi-même, sauf le propriétaire ;
- personne ne modifie ses propres droits ;
- le dernier propriétaire actif est protégé ;
- un compte super admin n'est jamais ajouté ni modifié depuis une équipe.

## 4. Permissions

Une permission est un droit précis. Le rôle fournit un **préréglage**, et le propriétaire (ou un membre ayant `team.manage`) ajoute ou retire des permissions individuellement **sans changer le rôle**. Ces ajustements sont stockés dans `Membership.permission_overrides` et s'appliquent dès la requête suivante.

| Groupe | Permission | Usage réel dans l'application |
|---|---|---|
| Établissement | `restaurant.view` | Consulter le restaurant |
| | `restaurant.edit` | Informations, coordonnées, horaires |
| | `settings.edit` | Paramètres de commande et de réservation, postes de cuisine |
| | `media.manage` | Logo, couverture, galerie, photos des plats |
| | `qr.manage` | Personnaliser le QR Code |
| Menu | `menu.view` / `menu.create` / `menu.edit` / `menu.delete` | Catégories, plats, options |
| | `prices.edit` | Prix, promotions, suppléments payants |
| | `stock.manage` | Disponibilité (ruptures) |
| Commandes | `orders.history` | Consulter les commandes |
| | `orders.create` | Prise de commande (guichet, salle) |
| | `orders.prepare` | Écran cuisine, avancement des statuts |
| | `orders.cancel` | Annuler |
| Paiements | `payments.record` / `payments.refund` | Encaisser / rembourser |
| Réservations | `reservations.view` / `reservations.manage` | Consulter / gérer |
| Statistiques | `stats.view` | Statistiques et chiffre d'affaires |
| Équipe | `team.view` / `team.manage` | Consulter / gérer l'équipe et les permissions |
| Journal | `activity.view` *(nouveau)* | Journal d'activité **du restaurant** |

Correspondance avec la liste demandée :

| Permissions demandées | Équivalent OmegaSen |
|---|---|
| `users.*` | `team.view` / `team.manage` |
| `orders.view` | `orders.history` |
| `kitchen.*` | `orders.prepare` |
| `qr_codes.*` | `qr.manage` |
| `payments.create` | `payments.record` |
| `analytics.view` | `stats.view` |
| `inventory.*` | `stock.manage` |
| `restaurant.update` | `restaurant.edit` |
| `restaurant.settings.manage` | `settings.edit` |

Ces permissions n'ont pas été créées, parce que la fonctionnalité correspondante n'existe pas (pas de permissions vides) : `orders.delete` (une commande ne se supprime pas, elle s'annule), `orders.update` (une commande n'est pas modifiable après validation), `tables.*` (pas d'entité table), `analytics.export` (pas d'export).

## 5. Statut des restaurants : règle centrale

| Statut | Membres | Public | Super admin |
|---|---|---|---|
| `ACTIVE` | Accès selon rôle et permissions | Menu, commandes, réservations | Tout |
| `PENDING` | Seuls `OWNER` et `ADMIN` préparent le restaurant ; les autres sont bloqués (`restaurant_pending`) | Invisible | Tout, et seul à pouvoir l'activer |
| `SUSPENDED` | **Tous bloqués**, propriétaires compris (`restaurant_suspended`) | Invisible | Tout (consultation et administration) |
| `CLOSED` | Tous bloqués (`restaurant_closed`), données conservées | Invisible | Tout ; suppression sécurisée possible |

**Ce qui se passe à la suspension** (`POST /api/admin/restaurants/{id}/status`, motif obligatoire pour SUSPENDED et CLOSED) :
1. Le statut change. **Aucun compte ni rattachement n'est modifié.**
2. Chaque requête relit le statut. Les membres reçoivent immédiatement `403 restaurant_suspended` avec le message : « Votre restaurant a été temporairement suspendu. Veuillez contacter l'administrateur de la plateforme OmegaSen. »
   - Cela vaut sur les API du restaurant, mais aussi sur les notifications et l'espace client des comptes dont **tous** les restaurants sont bloqués.
   - Seuls `/api/auth/me`, qui sert à afficher le motif, et la déconnexion restent permis.
3. La connexion et le renouvellement de session sont refusés avec ce même message. L'activation d'un compte enregistre le mot de passe mais n'ouvre pas de session.
4. Les jetons de rafraîchissement des membres sans plus aucun restaurant accessible sont **révoqués**. Les jetons d'accès déjà émis (15 min au plus) deviennent inutilisables dès la requête suivante (point 2).
5. Un événement `access.changed` est publié : les WebSockets ouvertes revérifient leurs droits et **se ferment**, et l'interface recharge le profil pour afficher un écran explicite.
6. Le changement est tracé (état avant et après, motif, nombre de sessions révoquées) et les responsables sont notifiés.

**Réactivation** : comme rien n'a été modifié sur les comptes, chacun retrouve son rôle et ses permissions en se reconnectant. Un compte **désactivé individuellement** (`User.is_active = false`) ou un rattachement désactivé reste bloqué.

**Compte membre de plusieurs restaurants** : il garde l'accès à ses restaurants actifs. Seul le restaurant suspendu est refusé, et le profil indique, restaurant par restaurant, `access_blocked` et `access_message`.

**Suppression d'un restaurant** (`DELETE /api/admin/restaurants/{id}`) :
- n'est possible que pour un restaurant déjà **fermé** ;
- exige de saisir son adresse (`confirm_slug`) et un motif ;
- est une suppression logique (`deleted_at`) : commandes, paiements et journal sont conservés ;
- désactive le QR Code et révoque les sessions des membres.

## 6. Sessions et changements de droits

| Événement | Effet |
|---|---|
| Compte désactivé (super admin) | Refus immédiat (relu à chaque requête) et sessions révoquées |
| Compte supprimé | Sessions supprimées, jeton d'accès refusé (`401`) |
| Mot de passe réinitialisé par le super admin | Lien à usage unique envoyé (le mot de passe n'est jamais vu ni choisi par l'admin) et sessions révoquées |
| Rôle ou permissions modifiés | Appliqués dès la requête suivante (permissions recalculées à chaque requête), filtre des WebSockets mis à jour, profil rechargé dans l'interface |
| Collaborateur désactivé ou retiré | Plus d'accès au restaurant ; sessions révoquées s'il n'a plus aucun restaurant actif |
| Restaurant suspendu, fermé ou en attente | § 5 |
| Restaurant réactivé | Les comptes encore actifs reviennent |

**Temps réel** (`app/core/realtime.py`, `app/modules/ws.py`) :
- chaque WebSocket de restaurant ou personnelle revérifie les droits toutes les 30 s et à chaque `access.changed`, et se ferme (code 1008) s'ils ont disparu ;
- un événement n'est relayé qu'à un abonné qui pourrait lire la même donnée par l'API : `order.*` exige un droit sur les commandes, `reservation.*` exige `reservations.view`, `menu.*` exige `menu.view`.

**Tâches asynchrones** : le worker ARQ ne fait que purger les jetons expirés. Il n'agit au nom d'aucun utilisateur et n'est donc pas concerné par ces contrôles.

## 7. Traçabilité

Chaque entrée du journal (`audit_logs`) contient l'auteur, la date, le type d'action, la ressource, le restaurant et, selon le cas, l'état avant et après :

| Action | Code |
|---|---|
| Changement de statut d'un restaurant (motif inclus) | `admin.restaurant_status` |
| Suppression d'un restaurant | `admin.restaurant_deleted` |
| Création d'un compte | `admin.user_created` |
| Modification d'un compte (changements avant/après, sessions révoquées) | `admin.user_updated` |
| Suppression d'un compte | `admin.user_deleted` |
| Réinitialisation de mot de passe | `admin.password_reset` |
| Rattachement ajouté, modifié ou retiré par la plateforme | `admin.membership_*` |
| Équipe (rôle et permissions avant/après) | `member.added`, `member.updated`, `member.removed` |
| Connexion refusée pour un restaurant bloqué | `auth.login_blocked` |
| Sessions fermées après désactivation | `auth.sessions_revoked` |

Le **journal global** (`/api/admin/audit-logs`, filtres par restaurant, auteur, ressource et action) est réservé au super admin. Le propriétaire et l'administrateur consultent le **journal de leur restaurant** (`/api/restaurants/{id}/activity`, permission `activity.view`). Les actions de la plateforme y apparaissent au nom d'« Équipe OmegaSen », sans révéler le compte du super admin.

## 8. Migrations

| Migration | Contenu |
|---|---|
| `20261106_b7c4d1e9a2f0_restaurant_is_demo` | `restaurants.is_demo` (environnement de test Baobab) |
| `20261106_c3e8f1a7b2d4_role_hierarchy` | Contrainte des rôles élargie (`ADMIN`, `WAITER`, `STAFF`). Les responsables existants voient leurs ajustements **recalculés** par rapport au nouveau préréglage `MANAGER`, pour que leurs permissions effectives restent **identiques** : aucun droit perdu ni gagné. Le downgrade est réversible et refusé si des rattachements utilisent déjà les nouveaux rôles. |

Vérification faite sur la base de développement : permissions effectives de tous les rattachements comparées avant et après (identiques), puis `downgrade` et `upgrade`, et `alembic check` propre.

## 9. Tests

Fichier principal : `backend/tests/test_access_control.py`. Les scénarios A à D et les non-régressions sont décrits ci-dessous.

- **A – Suspension.** Un compte par rôle, avec deux appareils réellement connectés.
  - Pendant la suspension : refus sur les API, les notifications, la connexion et le renouvellement, avec le message exact. Toutes les sessions sont révoquées et aucun compte n'est modifié.
  - Après réactivation : les permissions sont identiques, mais un compte bloqué entre-temps le reste.
  - S'y ajoutent les règles PENDING et CLOSED, et le cas d'un membre de deux restaurants.
- **B – Permissions.** Un STAFF avec permissions sur mesure.
  - Les actions autorisées passent, les autres sont refusées.
  - Une modification prend effet immédiatement sur la même session.
  - Une désactivation coupe l'accès et révoque les sessions.
  - La hiérarchie complète est testée (administrateur, responsable, auto-modification).
- **C – Isolation.** Deux restaurants, 14 tentatives × 7 comptes, y compris une ressource de B appelée sous l'URL de A : tout est refusé, l'existence de B n'est jamais révélée, et rien ne change chez B.
- **D – Super admin.**
  - Liste et filtre par statut, compteurs du tableau de bord.
  - Accès complet à un restaurant suspendu.
  - Désactivation, réinitialisation et suppression d'un utilisateur.
  - Modification des permissions avec effet immédiat.
  - Suppression sécurisée d'un restaurant, journal complet.
  - Aucun propriétaire ne peut obtenir de pouvoirs de plateforme.
- **Non-régressions.**
  - La faille du mot de passe (§ 1.1) est corrigée.
  - Un super admin n'est jamais membre d'un restaurant.
  - Journal du restaurant.
  - Règles du temps réel (filtrage des événements, fermeture à la suspension et à la désactivation).
  - Un lien d'activation n'ouvre pas de session dans un restaurant suspendu.

## 10. Hors périmètre (non implémenté)

Ces éléments n'existent pas dans OmegaSen et n'ont **pas** été simulés :

- **Licences et abonnements** : aucun modèle de facturation n'existe. Il faudrait le concevoir (plans, périodes, quotas, prestataire de paiement), et son expiration pourrait alors s'appuyer sur le statut `SUSPENDED`.
- **Paramètres globaux de la plateforme et activation de fonctionnalités** (feature flags) : rien n'existe aujourd'hui. Les paramètres techniques restent dans les variables d'environnement.
- **Impersonation** : non implémentée. Le super admin administre déjà n'importe quel restaurant en mode administration (`/manage/{id}`, statut ignoré, actions tracées à son nom), sans se connecter au compte de quelqu'un d'autre ni connaître son mot de passe. C'est plus sûr et suffisant pour le support. Si elle devenait nécessaire, il faudrait un jeton dédié de courte durée, en lecture seule par défaut, tracé au début et à la fin, et signalé à l'utilisateur concerné.
