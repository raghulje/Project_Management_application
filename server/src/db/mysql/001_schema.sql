-- =============================================================================
-- Refex Project Management 2026 — MySQL Schema
-- Database: ProjectManagement_2026
-- Same foundation as Asset Management (users / employees / HRMS / RBAC)
-- plus projects → tasks → subtasks (local-first; Kissflow ids are optional legacy keys)
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS `ProjectManagement_2026`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ProjectManagement_2026`;

CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `version` VARCHAR(64) NOT NULL,
  `description` VARCHAR(255) NULL,
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_schema_migrations_version` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `site_name` VARCHAR(191) NOT NULL DEFAULT 'Project Management',
  `site_locale` VARCHAR(16) NOT NULL DEFAULT 'en-IN',
  `default_currency` CHAR(3) NOT NULL DEFAULT 'INR',
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  `alert_email` VARCHAR(191) NULL,
  `login_note` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `companies` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(64) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_companies_name` (`name`),
  KEY `idx_companies_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `legal_entities` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `company_id` INT UNSIGNED NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_legal_entities_company_code` (`company_id`, `code`),
  KEY `idx_legal_entities_company` (`company_id`),
  CONSTRAINT `fk_legal_entities_company`
    FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `locations` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `parent_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `address` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_locations_parent` (`parent_id`),
  KEY `idx_locations_company` (`company_id`),
  CONSTRAINT `fk_locations_parent` FOREIGN KEY (`parent_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_locations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `company_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_departments_company` (`company_id`),
  CONSTRAINT `fk_departments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_departments_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permission_groups` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `permissions` JSON NOT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_permission_groups_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_num` VARCHAR(64) NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `email` VARCHAR(191) NULL,
  `password` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(40) NULL,
  `jobtitle` VARCHAR(150) NULL,
  `company_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `department_id` INT UNSIGNED NULL,
  `manager_id` INT UNSIGNED NULL,
  `activated` TINYINT(1) NOT NULL DEFAULT 1,
  `permissions` JSON NULL,
  `notes` TEXT NULL,
  `last_login` DATETIME NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_username` (`username`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_deleted` (`deleted_at`),
  CONSTRAINT `fk_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_manager` FOREIGN KEY (`manager_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users_groups` (
  `user_id` INT UNSIGNED NOT NULL,
  `group_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`user_id`, `group_id`),
  CONSTRAINT `fk_users_groups_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_users_groups_group` FOREIGN KEY (`group_id`) REFERENCES `permission_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_password_reset_hash` (`token_hash`),
  CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `employees` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_code` VARCHAR(64) NOT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) NOT NULL DEFAULT '',
  `title` VARCHAR(32) NULL,
  `sex` VARCHAR(16) NULL,
  `date_of_birth` DATE NULL,
  `joining_date` DATE NULL,
  `date_of_exit` DATE NULL,
  `legal_entity_code` VARCHAR(64) NULL,
  `branch_code` VARCHAR(64) NULL,
  `department_code` VARCHAR(64) NULL,
  `department_name` VARCHAR(191) NULL,
  `business_line` VARCHAR(191) NULL,
  `designation` VARCHAR(191) NULL,
  `grade_name` VARCHAR(64) NULL,
  `supervisor_employee_code` VARCHAR(64) NULL,
  `pan_number` VARCHAR(32) NULL,
  `email` VARCHAR(191) NULL,
  `personal_email` VARCHAR(191) NULL,
  `mobile` VARCHAR(64) NULL,
  `work_mobile` VARCHAR(64) NULL,
  `office_location` VARCHAR(191) NULL,
  `employee_pincode` VARCHAR(20) NULL,
  `employment_status` VARCHAR(32) NULL,
  `employment_status_description` VARCHAR(100) NULL,
  `employee_status` VARCHAR(32) NULL,
  `employee_status_description` VARCHAR(100) NULL,
  `emp_added_on` DATETIME NULL,
  `refex_company_name` VARCHAR(191) NULL,
  `refex_location` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `hrms_payload` JSON NULL,
  `synced_at` DATETIME NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_employees_code` (`employee_code`),
  KEY `idx_employees_email` (`email`),
  KEY `idx_employees_department` (`department_name`),
  KEY `idx_employees_company` (`refex_company_name`),
  KEY `idx_employees_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `action_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL,
  `action_type` VARCHAR(64) NOT NULL,
  `item_type` VARCHAR(64) NULL,
  `item_id` INT UNSIGNED NULL,
  `target_type` VARCHAR(64) NULL,
  `target_id` INT UNSIGNED NULL,
  `location_id` INT UNSIGNED NULL,
  `company_id` INT UNSIGNED NULL,
  `note` TEXT NULL,
  `log_meta` JSON NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(255) NULL,
  `action_date` DATETIME NOT NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_action_logs_item` (`item_type`, `item_id`),
  KEY `idx_action_logs_user` (`user_id`),
  CONSTRAINT `fk_action_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Projects (local id + project_code are canonical; kissflow_id is legacy import)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `projects` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kissflow_id` VARCHAR(64) NULL COMMENT 'Legacy Kissflow case id, optional',
  `project_code` VARCHAR(128) NULL COMMENT 'Business code, e.g. PRJ-2026-0001',
  `name` VARCHAR(255) NOT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'Open',
  `priority` VARCHAR(32) NULL,
  `rag` VARCHAR(32) NULL,
  `risk` VARCHAR(32) NULL,
  `category` VARCHAR(128) NULL COMMENT 'Project_Category / Function',
  `project_type` VARCHAR(64) NULL,
  `project_request` VARCHAR(64) NULL,
  `function_type` VARCHAR(128) NULL,
  `function_category` VARCHAR(128) NULL,
  `function_sub_category` VARCHAR(128) NULL,
  `company_name` VARCHAR(191) NULL,
  `entity` VARCHAR(191) NULL,
  `business` VARCHAR(191) NULL,
  `company_id` INT UNSIGNED NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `governance_frequency` VARCHAR(64) NULL,
  `ai_usage` TINYINT(1) NOT NULL DEFAULT 0,
  `ai_details` VARCHAR(255) NULL,
  `reports_available` TINYINT(1) NOT NULL DEFAULT 0,
  `integrated_with_tally` TINYINT(1) NOT NULL DEFAULT 0,
  `integrated_with_sap` TINYINT(1) NOT NULL DEFAULT 0,
  `integrated_with_power_bi` TINYINT(1) NOT NULL DEFAULT 0,
  `brd_available` TINYINT(1) NOT NULL DEFAULT 0,
  `process_document` TINYINT(1) NOT NULL DEFAULT 0,
  `support_available` TINYINT(1) NOT NULL DEFAULT 0,
  `cb_analysis_available` TINYINT(1) NOT NULL DEFAULT 0,
  `risk_mitigation` TINYINT(1) NOT NULL DEFAULT 0,
  `risk_mitigation_details` TEXT NULL,
  `objectives` TEXT NULL,
  `tech_stack` JSON NULL,
  `tat_days` INT NULL,
  `aging_days` INT NULL,
  `hours` DECIMAL(10,2) NULL DEFAULT 0,
  `tco_efforts` DECIMAL(10,2) NULL,
  `completion` DECIMAL(10,2) NULL DEFAULT 0,
  `application_name` VARCHAR(191) NULL,
  `vendor_name` VARCHAR(191) NULL,
  `l1_manager_email` VARCHAR(191) NULL,
  `l2_manager_email` VARCHAR(191) NULL,
  `requester_employee_id` INT UNSIGNED NULL,
  `requester_name` VARCHAR(191) NULL,
  `business_owner_employee_id` INT UNSIGNED NULL,
  `business_owner_name` VARCHAR(191) NULL,
  `project_owner_employee_id` INT UNSIGNED NULL,
  `project_owner_name` VARCHAR(191) NULL,
  `sponsor_employee_id` INT UNSIGNED NULL,
  `sponsor_name` VARCHAR(191) NULL,
  `project_manager_employee_id` INT UNSIGNED NULL,
  `project_manager_name` VARCHAR(191) NULL,
  `developer_employee_id` INT UNSIGNED NULL,
  `developer_name` VARCHAR(191) NULL,
  `cos_owner_name` VARCHAR(191) NULL,
  `assignee_name` VARCHAR(191) NULL,
  `created_by_user_id` INT UNSIGNED NULL,
  `updated_by_user_id` INT UNSIGNED NULL,
  `source` VARCHAR(16) NOT NULL DEFAULT 'local',
  `closed_at` DATETIME NULL,
  `closed_by_user_id` INT UNSIGNED NULL,
  `deleted_by_user_id` INT UNSIGNED NULL,
  `kissflow_created_at` DATETIME NULL,
  `kissflow_modified_at` DATETIME NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_projects_kissflow` (`kissflow_id`),
  KEY `idx_projects_code` (`project_code`),
  KEY `idx_projects_status` (`status`),
  KEY `idx_projects_category` (`category`),
  KEY `idx_projects_owner` (`project_owner_employee_id`),
  KEY `idx_projects_source` (`source`),
  KEY `idx_projects_closed` (`closed_at`),
  KEY `idx_projects_company_name` (`company_name`),
  KEY `idx_projects_dates` (`start_date`, `end_date`),
  KEY `idx_projects_created_by` (`created_by_user_id`),
  KEY `idx_projects_deleted` (`deleted_at`),
  CONSTRAINT `fk_projects_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `project_timeline_history` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `revised_end_date` DATE NULL,
  `changed_on` DATETIME NULL,
  `created_by_name` VARCHAR(191) NULL,
  `created_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pth_project` (`project_id`),
  CONSTRAINT `fk_pth_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Tasks (local id + task_code are canonical; kissflow_id is legacy import)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kissflow_id` VARCHAR(64) NULL COMMENT 'Legacy Kissflow process id, optional',
  `task_code` VARCHAR(191) NULL COMMENT 'Business code, e.g. TSK-2026-0001',
  `project_id` INT UNSIGNED NULL,
  `name` VARCHAR(255) NOT NULL,
  `detail` MEDIUMTEXT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'Open',
  `workflow_status` VARCHAR(64) NULL,
  `priority` VARCHAR(32) NULL,
  `task_type` VARCHAR(64) NULL,
  `entity` VARCHAR(191) NULL,
  `application_name` VARCHAR(191) NULL,
  `function_category` VARCHAR(128) NULL,
  `function_sub_category` VARCHAR(128) NULL,
  `function_type` VARCHAR(128) NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `tat_days` INT NULL,
  `aging_days` INT NULL,
  `requires_approval` TINYINT(1) NOT NULL DEFAULT 0,
  `is_dependent` TINYINT(1) NOT NULL DEFAULT 0,
  `dependent_on_task_id` INT UNSIGNED NULL,
  `assigned_to_employee_id` INT UNSIGNED NULL,
  `assigned_to_name` VARCHAR(191) NULL,
  `secondary_assignee_name` VARCHAR(191) NULL,
  `l1_manager_email` VARCHAR(191) NULL,
  `l2_manager_email` VARCHAR(191) NULL,
  `root_cause_analysis` TEXT NULL,
  `created_by_user_id` INT UNSIGNED NULL,
  `updated_by_user_id` INT UNSIGNED NULL,
  `created_by_name` VARCHAR(191) NULL,
  `created_by_email` VARCHAR(191) NULL,
  `source` VARCHAR(16) NOT NULL DEFAULT 'local',
  `closed_at` DATETIME NULL,
  `closed_by_user_id` INT UNSIGNED NULL,
  `deleted_by_user_id` INT UNSIGNED NULL,
  `kissflow_created_at` DATETIME NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tasks_kissflow` (`kissflow_id`),
  KEY `idx_tasks_code` (`task_code`),
  KEY `idx_tasks_project` (`project_id`),
  KEY `idx_tasks_status` (`status`),
  KEY `idx_tasks_assignee` (`assigned_to_employee_id`),
  KEY `idx_tasks_source` (`source`),
  KEY `idx_tasks_closed` (`closed_at`),
  KEY `idx_tasks_dates` (`end_date`),
  KEY `idx_tasks_created_by` (`created_by_user_id`),
  KEY `idx_tasks_deleted` (`deleted_at`),
  CONSTRAINT `fk_tasks_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tasks_assignee` FOREIGN KEY (`assigned_to_employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tasks_dependent` FOREIGN KEY (`dependent_on_task_id`) REFERENCES `tasks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- Subtasks (local id + subtask_code are canonical; kissflow_id is legacy import)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subtasks` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `kissflow_id` VARCHAR(64) NULL COMMENT 'Legacy Kissflow process id, optional',
  `subtask_code` VARCHAR(191) NULL COMMENT 'Business code, e.g. SUB-2026-0001',
  `task_id` INT UNSIGNED NULL,
  `name` VARCHAR(255) NOT NULL,
  `summary` TEXT NULL,
  `status` VARCHAR(64) NOT NULL DEFAULT 'Open',
  `workflow_status` VARCHAR(64) NULL,
  `priority` VARCHAR(32) NULL,
  `start_date` DATE NULL,
  `end_date` DATE NULL,
  `is_dependent` TINYINT(1) NOT NULL DEFAULT 0,
  `assigned_to_employee_id` INT UNSIGNED NULL,
  `assigned_to_name` VARCHAR(191) NULL,
  `l1_manager_email` VARCHAR(191) NULL,
  `l2_manager_email` VARCHAR(191) NULL,
  `created_by_user_id` INT UNSIGNED NULL,
  `updated_by_user_id` INT UNSIGNED NULL,
  `created_by_name` VARCHAR(191) NULL,
  `source` VARCHAR(16) NOT NULL DEFAULT 'local',
  `closed_at` DATETIME NULL,
  `closed_by_user_id` INT UNSIGNED NULL,
  `deleted_by_user_id` INT UNSIGNED NULL,
  `kissflow_created_at` DATETIME NULL,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_subtasks_kissflow` (`kissflow_id`),
  KEY `idx_subtasks_task` (`task_id`),
  KEY `idx_subtasks_code` (`subtask_code`),
  KEY `idx_subtasks_status` (`status`),
  KEY `idx_subtasks_assignee` (`assigned_to_employee_id`),
  KEY `idx_subtasks_source` (`source`),
  KEY `idx_subtasks_closed` (`closed_at`),
  KEY `idx_subtasks_dates` (`end_date`),
  KEY `idx_subtasks_deleted` (`deleted_at`),
  CONSTRAINT `fk_subtasks_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_subtasks_assignee` FOREIGN KEY (`assigned_to_employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
