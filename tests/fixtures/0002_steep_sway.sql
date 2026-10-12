-- Migration 003 (drizzle 0002) — refonte de `planned_block` sur le vocabulaire
-- de blocs figé en T3.2.
--
-- ÉCRITE À LA MAIN. La version produite par `drizzle-kit generate` recopiait
-- l'ancienne table vers la nouvelle en nommant, des DEUX côtés du transfert,
-- les colonnes de la CIBLE. Le `SELECT "parent_block_id", "measure", …` portait
-- donc sur dix colonnes absentes de la table d'origine : échec certain à
-- l'exécution, au démarrage de l'application.
--
-- Aucune recopie n'est nécessaire. `planned_block` est vide par construction :
-- aucun fichier du dépôt n'y écrit — l'éditeur manuel est l'objet de cette
-- tranche et l'import coach arrive en T5. Vérifié le 23/08/2026 par recherche
-- de `plannedBlock` dans `src/`, une seule occurrence, sa déclaration.
--
-- La règle de SPECS-TECH §3 — aucune migration ne supprime de donnée sans
-- conversion explicite — est donc respectée : il n'y a pas de donnée.

PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE `planned_block`;--> statement-breakpoint
CREATE TABLE `planned_block` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planned_session_id` integer NOT NULL,
	`parent_block_id` integer,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`measure` text,
	`measure_value` real,
	`set_mode` text,
	`set_count` integer,
	`set_window_s` integer,
	`target_type` text DEFAULT 'NONE' NOT NULL,
	`target_low` real,
	`target_high` real,
	`relative_to` text,
	`label` text,
	`notes` text,
	`discipline` text,
	FOREIGN KEY (`planned_session_id`) REFERENCES `planned_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `planned_block_position_idx` ON `planned_block` (`planned_session_id`,`parent_block_id`,`position`);--> statement-breakpoint
CREATE INDEX `planned_block_parent_idx` ON `planned_block` (`parent_block_id`);
