ALTER TABLE `projects`
  ADD COLUMN `tco_efforts` DECIMAL(10,2) NULL AFTER `hours`,
  ADD COLUMN `risk_mitigation_details` TEXT NULL AFTER `risk_mitigation`,
  ADD COLUMN `assignee_name` VARCHAR(191) NULL AFTER `cos_owner_name`;
