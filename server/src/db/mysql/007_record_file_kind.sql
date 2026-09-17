ALTER TABLE `record_files`
  ADD COLUMN `kind` VARCHAR(64) NULL AFTER `item_id`,
  ADD KEY `idx_files_item_kind` (`item_type`, `item_id`, `kind`);
