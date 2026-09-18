CREATE TABLE IF NOT EXISTS `record_comments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_type` VARCHAR(32) NOT NULL,
  `item_id` INT UNSIGNED NOT NULL,
  `body` TEXT NOT NULL,
  `mentions` JSON NULL,
  `created_by_user_id` INT UNSIGNED NULL,
  `created_by_name` VARCHAR(191) NULL,
  `created_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comments_item` (`item_type`, `item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `record_files` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_type` VARCHAR(32) NOT NULL,
  `item_id` INT UNSIGNED NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `stored_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(128) NULL,
  `size_bytes` INT NULL,
  `created_by_user_id` INT UNSIGNED NULL,
  `created_by_name` VARCHAR(191) NULL,
  `created_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_files_item` (`item_type`, `item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `record_assignees` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_type` VARCHAR(32) NOT NULL,
  `item_id` INT UNSIGNED NOT NULL,
  `person_name` VARCHAR(191) NOT NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_assignee` (`item_type`, `item_id`, `person_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
