CREATE TABLE IF NOT EXISTS `record_revisions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_type` VARCHAR(32) NOT NULL,
  `item_id` INT UNSIGNED NOT NULL,
  `revision_no` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `user_name` VARCHAR(191) NULL,
  `changes_json` JSON NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_record_revisions_item_no` (`item_type`, `item_id`, `revision_no`),
  KEY `idx_record_revisions_item` (`item_type`, `item_id`),
  KEY `idx_record_revisions_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
