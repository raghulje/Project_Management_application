-- Notification config + send logs (from Asset Management + P2P email_logs)

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings' AND COLUMN_NAME = 'notification_config'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `settings` ADD COLUMN `notification_config` JSON NULL AFTER `alert_email`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `notification_log` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kind` VARCHAR(64) NOT NULL,
  `item_type` VARCHAR(64) NOT NULL,
  `item_id` INT UNSIGNED NOT NULL,
  `notified_on` DATE NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_log_day` (`kind`, `item_type`, `item_id`, `notified_on`),
  KEY `idx_notification_log_kind_day` (`kind`, `notified_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email_type` VARCHAR(64) NOT NULL,
  `status` ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  `project_id` INT UNSIGNED NULL,
  `task_id` INT UNSIGNED NULL,
  `subtask_id` INT UNSIGNED NULL,
  `related_id` INT UNSIGNED NULL,
  `project_code` VARCHAR(128) NULL,
  `task_code` VARCHAR(191) NULL,
  `to_addresses` TEXT NOT NULL,
  `cc_addresses` TEXT NULL,
  `bcc_addresses` TEXT NULL,
  `subject` VARCHAR(500) NOT NULL,
  `message_id` VARCHAR(255) NULL,
  `error_message` TEXT NULL,
  `meta_json` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_email_logs_created` (`created_at`),
  KEY `idx_email_logs_status` (`status`),
  KEY `idx_email_logs_project` (`project_id`),
  KEY `idx_email_logs_task` (`task_id`),
  KEY `idx_email_logs_type` (`email_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
